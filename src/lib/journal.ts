import "server-only";
import type { EntryKind, RevisionSource } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  ingredientsToText,
  slugify,
  stepsToText,
  updateRecipe,
  type FullRecipe,
} from "@/lib/recipes";
import { parseSnapshot, SNAPSHOT_VERSION, type RecipeSnapshot } from "@/lib/snapshot";

/**
 * The recipe's log and its history.
 *
 * A recipe is not finished when it is written. It is cooked, found wanting, and
 * adjusted — and the reason for each adjustment outlives the adjustment. "The
 * crumb was dry at 180 g of butter" is what makes the next change an informed
 * one, and is exactly what is lost when a recipe is simply edited in place.
 *
 * Two tables, one feature:
 *
 *  - `RecipeEntry` is the log: notes the owner writes, messages sent to Claude,
 *    and Claude's replies, in one chronological series.
 *  - `RecipeRevision` is the history: a complete snapshot after every change.
 *
 * An entry that caused a change points at the revision it caused, which is what
 * lets the history show *why* a version exists rather than only that it does.
 */

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/** Freezes a recipe as it currently stands. */
export function snapshotOf(recipe: FullRecipe): RecipeSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    title: recipe.title,
    description: recipe.description,
    categoryName: recipe.category.name,
    tagNames: recipe.tags.map((tag) => tag.name),
    baseServings: recipe.baseServings,
    servingLabel: recipe.servingLabel,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    sourceUrl: recipe.sourceUrl,
    notes: recipe.notes,
    ingredients: ingredientsToText(recipe).split("\n").filter(Boolean),
    steps: stepsToText(recipe).split("\n").filter(Boolean),
  };
}

/** Loads the recipe and freezes it, for callers that hold only an id. */
async function snapshotById(recipeId: string): Promise<RecipeSnapshot | null> {
  const recipe = await db.recipe.findUnique({
    where: { id: recipeId },
    include: {
      category: true,
      tags: { orderBy: { name: "asc" } },
      ingredients: { orderBy: { position: "asc" }, include: { ingredient: true } },
      steps: { orderBy: { position: "asc" } },
    },
  });
  return recipe ? snapshotOf(recipe) : null;
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export interface Revision {
  id: string;
  number: number;
  source: RevisionSource;
  summary: string;
  createdAt: Date;
  snapshot: RecipeSnapshot | null;
  /** The log entry that caused this revision, when there was one. */
  reason: { id: string; kind: EntryKind; text: string } | null;
}

const revisionSelect = {
  id: true,
  number: true,
  source: true,
  summary: true,
  createdAt: true,
  snapshot: true,
  entry: { select: { id: true, kind: true, text: true } },
} as const;

function toRevision(row: {
  id: string;
  number: number;
  source: RevisionSource;
  summary: string;
  createdAt: Date;
  snapshot: unknown;
  entry: { id: string; kind: EntryKind; text: string } | null;
}): Revision {
  return {
    id: row.id,
    number: row.number,
    source: row.source,
    summary: row.summary,
    createdAt: row.createdAt,
    snapshot: parseSnapshot(row.snapshot),
    reason: row.entry,
  };
}

/** Every revision of a recipe, oldest first. */
export async function listRevisions(recipeId: string): Promise<Revision[]> {
  const rows = await db.recipeRevision.findMany({
    where: { recipeId },
    orderBy: { number: "asc" },
    select: revisionSelect,
  });
  return rows.map(toRevision);
}

export async function countRevisions(recipeId: string): Promise<number> {
  return db.recipeRevision.count({ where: { recipeId } });
}

/**
 * Records the recipe's *current* state as a revision.
 *
 * Called **after** a change has been written, so revision `n` is the recipe as
 * it stood once change `n` had been applied.
 *
 * The baseline matters more than it looks. Before the first recorded change, an
 * extra `INITIAL` revision is written capturing the state the recipe had *when
 * the change began*, so the series is complete and the very first change is as
 * undoable as every later one. Without it, the original version of every recipe
 * that predates this feature would be unrecoverable — which is precisely the
 * version a cook is most likely to want back.
 */
export async function recordRevision(
  recipeId: string,
  source: RevisionSource,
  summary: string,
  options: { baseline?: RecipeSnapshot | null; entryId?: string | null } = {},
): Promise<string | null> {
  const snapshot = await snapshotById(recipeId);
  if (!snapshot) return null;

  const existing = await db.recipeRevision.count({ where: { recipeId } });
  let next = existing;

  if (existing === 0 && options.baseline) {
    await db.recipeRevision.create({
      data: {
        recipeId,
        number: 1,
        source: "INITIAL",
        summary: "As it stood before the first recorded change.",
        snapshot: { ...options.baseline },
      },
    });
    next = 1;
  }

  const revision = await db.recipeRevision.create({
    data: {
      recipeId,
      number: next + 1,
      source,
      summary,
      snapshot: { ...snapshot },
    },
    select: { id: true },
  });

  if (options.entryId) {
    await db.recipeEntry.update({
      where: { id: options.entryId },
      data: { revisionId: revision.id },
    });
  }

  return revision.id;
}

/**
 * Rolls the recipe back to an earlier revision.
 *
 * The restore is itself recorded as a new revision rather than by deleting the
 * ones after it. History is append-only: undoing a mistake must not destroy the
 * record of it, or the second undo — the one that puts back what you had before
 * you panicked — becomes impossible.
 *
 * The snapshot goes back through `updateRecipe`, so the ingredient text is
 * re-parsed and re-resolved exactly as it would be for a hand edit.
 */
export async function restoreRevision(
  recipeId: string,
  revisionId: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const revision = await db.recipeRevision.findFirst({
    where: { id: revisionId, recipeId },
    select: { number: true, snapshot: true },
  });
  if (!revision) return { ok: false, error: "That version no longer exists." };

  const snapshot = parseSnapshot(revision.snapshot);
  if (!snapshot) {
    return { ok: false, error: "That version could not be read and was not restored." };
  }

  const before = await snapshotById(recipeId);

  // The category travels as a name, so it is found or created here — the same
  // rule the sharing bundle follows, and for the same reason.
  const category = await db.category.upsert({
    where: { slug: slugify(snapshot.categoryName) },
    update: {},
    create: {
      name: snapshot.categoryName,
      slug: slugify(snapshot.categoryName),
      position: 999,
    },
    select: { id: true },
  });

  const slug = await updateRecipe(recipeId, {
    title: snapshot.title,
    description: snapshot.description,
    categoryId: category.id,
    baseServings: snapshot.baseServings,
    servingLabel: snapshot.servingLabel,
    prepMinutes: snapshot.prepMinutes,
    cookMinutes: snapshot.cookMinutes,
    sourceUrl: snapshot.sourceUrl,
    notes: snapshot.notes,
    status: "SAVED",
    ingredientsText: snapshot.ingredients.join("\n"),
    stepsText: snapshot.steps.join("\n"),
    tagsText: snapshot.tagNames.join(", "),
  });

  await recordRevision(recipeId, "RESTORE", `Restored version ${revision.number}.`, {
    baseline: before,
  });

  return { ok: true, slug };
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

export interface Entry {
  id: string;
  kind: EntryKind;
  text: string;
  createdAt: Date;
  /** Set when this entry changed the recipe. */
  revision: { id: string; number: number; summary: string } | null;
}

/** The whole log for a recipe, oldest first. */
export async function listEntries(recipeId: string): Promise<Entry[]> {
  return db.recipeEntry.findMany({
    where: { recipeId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      text: true,
      createdAt: true,
      revision: { select: { id: true, number: true, summary: true } },
    },
  });
}

export async function countEntries(recipeId: string): Promise<number> {
  return db.recipeEntry.count({ where: { recipeId } });
}

/** Appends a line to the log. */
export async function addEntry(
  recipeId: string,
  kind: EntryKind,
  text: string,
): Promise<string | null> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const entry = await db.recipeEntry.create({
    data: { recipeId, kind, text: trimmed },
    select: { id: true },
  });
  return entry.id;
}

/**
 * Deletes a log entry.
 *
 * Notes are the owner's own words and must be deletable — a mistyped one that
 * cannot be removed is a permanent annoyance. The revision it produced, if any,
 * survives: the history is the record of what the recipe *was*, and that is not
 * the owner's to rewrite by tidying a note.
 */
export async function deleteEntry(recipeId: string, entryId: string): Promise<void> {
  await db.recipeEntry.deleteMany({ where: { id: entryId, recipeId } });
}

/**
 * The recent log, rendered for a prompt.
 *
 * Bounded, and oldest-truncated rather than newest: a note from three months ago
 * about the crumb being dry is context, but the last few entries are the
 * conversation, and dropping those would make Claude answer "make it hotter"
 * with no idea what "it" refers to.
 */
export function logForPrompt(entries: readonly Entry[], limit = 12): string {
  const recent = entries.slice(-limit);
  if (recent.length === 0) return "";
  const lines = recent.map((entry) => {
    const who =
      entry.kind === "REPLY" ? "You" : entry.kind === "NOTE" ? "Their note" : "They said";
    return `${who}: ${entry.text}`;
  });
  return ["The log for this recipe so far:", ...lines].join("\n");
}

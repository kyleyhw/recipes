import "server-only";
import type { Prisma, RecipeStatus } from "@/generated/prisma";
import { db } from "@/lib/db";
import { parseIngredientBlock } from "@/lib/ingredient-parser";

/**
 * Recipe persistence and search.
 *
 * All database access for recipes goes through this module so that the query
 * shapes stay in one place — in particular `searchRecipes`, which is the only
 * raw SQL in the application and needs to remain reviewable.
 */

/** Fields every card in a listing needs, and nothing more. */
export const recipeCardSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  status: true,
  photoUrl: true,
  baseServings: true,
  servingLabel: true,
  prepMinutes: true,
  cookMinutes: true,
  category: { select: { name: true, slug: true, glyph: true } },
} satisfies Prisma.RecipeSelect;

export type RecipeCard = Prisma.RecipeGetPayload<{ select: typeof recipeCardSelect }>;

/**
 * Converts a title into a URL slug.
 *
 * Unicode is normalised to NFD and combining marks stripped, so "Crème Brûlée"
 * becomes "creme-brulee" rather than losing the accented characters entirely.
 */
export function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  // A title of only punctuation or non-Latin script would slugify to "";
  // "recipe" keeps the URL valid and uniqueness handles the collisions.
  return base.length > 0 ? base : "recipe";
}

/**
 * Finds a slug not already taken, appending -2, -3, ... on collision.
 *
 * A random suffix would avoid the read entirely but produces ugly URLs for the
 * common case, which is no collision at all.
 */
export async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  const taken = await db.recipe.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true, id: true },
  });
  const used = new Set(taken.filter((r) => r.id !== excludeId).map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Full-text search over recipes.
 *
 * Uses the GIN expression indexes created in the initial migration. Two
 * `to_tsvector` expressions are searched — recipe prose and ingredient lines —
 * because "anything with harissa in it" is as common a query as searching by
 * title, and an ingredient never appears in the title.
 *
 * `websearch_to_tsquery` rather than `plainto_tsquery`: it accepts quoted
 * phrases and `or`/`-` operators that people type by habit, and unlike
 * `to_tsquery` it never raises a syntax error on unbalanced input, which would
 * turn a stray quotation mark into a 500.
 *
 * `ts_rank` ordering weights title matches above ingredient matches by
 * searching them as separate vectors and summing with a coefficient.
 */
export async function searchRecipes(query: string, limit = 50): Promise<RecipeCard[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT r."id",
           ts_rank(
             to_tsvector('english',
               coalesce(r."title", '') || ' ' ||
               coalesce(r."description", '') || ' ' ||
               coalesce(r."notes", '')),
             websearch_to_tsquery('english', ${trimmed})
           ) * 2.0
           +
           coalesce((
             SELECT max(ts_rank(
               to_tsvector('english', i."name" || ' ' || i."rawText"),
               websearch_to_tsquery('english', ${trimmed})
             ))
             FROM "RecipeIngredient" i
             WHERE i."recipeId" = r."id"
           ), 0) AS rank
    FROM "Recipe" r
    WHERE r."status" <> 'ARCHIVED'
      AND (
        to_tsvector('english',
          coalesce(r."title", '') || ' ' ||
          coalesce(r."description", '') || ' ' ||
          coalesce(r."notes", '')
        ) @@ websearch_to_tsquery('english', ${trimmed})
        OR EXISTS (
          SELECT 1 FROM "RecipeIngredient" i
          WHERE i."recipeId" = r."id"
            AND to_tsvector('english', i."name" || ' ' || i."rawText")
                @@ websearch_to_tsquery('english', ${trimmed})
        )
      )
    ORDER BY rank DESC, r."updatedAt" DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  // Prisma re-reads the rows so the caller gets typed, related data. The raw
  // query returns only ids, keeping the SQL to ranking rather than projection.
  const found = await db.recipe.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: recipeCardSelect,
  });
  // findMany does not preserve the IN-clause order, so relevance ranking is
  // reapplied here rather than silently degrading to insertion order.
  const order = new Map(rows.map((r, index) => [r.id, index]));
  return found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Categories with their recipes, for the browse shelves. */
export async function browseByCategory(): Promise<
  Array<{ id: string; name: string; slug: string; glyph: string; recipes: RecipeCard[] }>
> {
  const categories = await db.category.findMany({
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      glyph: true,
      recipes: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { updatedAt: "desc" },
        select: recipeCardSelect,
      },
    },
  });
  return categories;
}

/** Full recipe with everything needed to render the detail page. */
export async function getRecipeBySlug(slug: string) {
  return db.recipe.findUnique({
    where: { slug },
    include: {
      category: true,
      tags: { orderBy: { name: "asc" } },
      ingredients: { orderBy: { position: "asc" }, include: { ingredient: true } },
      steps: { orderBy: { position: "asc" } },
    },
  });
}

export type FullRecipe = NonNullable<Awaited<ReturnType<typeof getRecipeBySlug>>>;

/** Everything the editor submits. */
export interface RecipeInput {
  title: string;
  description: string | null;
  categoryId: string;
  baseServings: number;
  servingLabel: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  sourceUrl: string | null;
  notes: string | null;
  status: RecipeStatus;
  /** One ingredient per line, parsed by `ingredient-parser`. */
  ingredientsText: string;
  /** One step per line (blank lines separate paragraphs). */
  stepsText: string;
  /** Comma-separated tag names; created on demand. */
  tagsText: string;
}

function parseTagNames(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseSteps(text: string): string[] {
  return (
    text
      .split("\n")
      .map((s) => s.trim())
      // Strip "1." / "1)" numbering, which survives copy-and-paste and would
      // otherwise be rendered twice alongside the list's own numbering.
      .map((s) => s.replace(/^\d+[.)]\s*/, ""))
      .filter((s) => s.length > 0)
  );
}

/**
 * Connect-or-create for tags, matched case-insensitively.
 *
 * "Quick" and "quick" must be the same tag; the schema's unique constraint is
 * on the exact name, so the lookup normalises before deciding.
 */
async function resolveTagIds(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const existing = await db.tag.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await db.tag.create({
      data: { name, slug: slugify(name) },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

function ingredientRows(text: string) {
  return parseIngredientBlock(text).map((parsed, position) => ({
    position,
    rawText: parsed.rawText,
    quantity: parsed.quantity,
    unit: parsed.unit,
    name: parsed.name,
    prepNote: parsed.prepNote,
    scalable: parsed.scalable,
    optional: parsed.optional,
  }));
}

export async function createRecipe(input: RecipeInput): Promise<string> {
  const slug = await uniqueSlug(input.title);
  const tagIds = await resolveTagIds(parseTagNames(input.tagsText));

  const recipe = await db.recipe.create({
    data: {
      slug,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      baseServings: input.baseServings,
      servingLabel: input.servingLabel,
      prepMinutes: input.prepMinutes,
      cookMinutes: input.cookMinutes,
      sourceUrl: input.sourceUrl,
      notes: input.notes,
      status: input.status,
      tags: { connect: tagIds.map((id) => ({ id })) },
      ingredients: { create: ingredientRows(input.ingredientsText) },
      steps: {
        create: parseSteps(input.stepsText).map((text, position) => ({ position, text })),
      },
    },
    select: { slug: true },
  });
  return recipe.slug;
}

/**
 * Replaces a recipe's contents.
 *
 * Ingredients and steps are deleted and recreated rather than diffed. A diff
 * would preserve `ingredientId` resolutions across an edit, but correctly
 * matching edited lines to existing rows is guesswork, and a wrong match
 * silently attaches the wrong nutrition data — a worse outcome than re-running
 * resolution. The delete and the recreate share a transaction so a failure
 * cannot leave a recipe with no ingredients.
 */
export async function updateRecipe(id: string, input: RecipeInput): Promise<string> {
  const existing = await db.recipe.findUniqueOrThrow({
    where: { id },
    select: { slug: true, title: true },
  });
  const slug =
    existing.title === input.title ? existing.slug : await uniqueSlug(input.title, id);
  const tagIds = await resolveTagIds(parseTagNames(input.tagsText));

  await db.$transaction([
    db.recipeIngredient.deleteMany({ where: { recipeId: id } }),
    db.step.deleteMany({ where: { recipeId: id } }),
    db.recipe.update({
      where: { id },
      data: {
        slug,
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        baseServings: input.baseServings,
        servingLabel: input.servingLabel,
        prepMinutes: input.prepMinutes,
        cookMinutes: input.cookMinutes,
        sourceUrl: input.sourceUrl,
        notes: input.notes,
        status: input.status,
        tags: { set: tagIds.map((tagId) => ({ id: tagId })) },
        ingredients: { create: ingredientRows(input.ingredientsText) },
        steps: {
          create: parseSteps(input.stepsText).map((text, position) => ({
            position,
            text,
          })),
        },
      },
    }),
  ]);
  return slug;
}

export async function deleteRecipe(id: string): Promise<void> {
  // Ingredients and steps cascade; tags are shared and must survive.
  await db.recipe.delete({ where: { id } });
}

/** Renders a recipe's ingredients back into the editor's line format. */
export function ingredientsToText(recipe: FullRecipe): string {
  return recipe.ingredients.map((i) => i.rawText).join("\n");
}

export function stepsToText(recipe: FullRecipe): string {
  return recipe.steps.map((s) => s.text).join("\n");
}

export function tagsToText(recipe: FullRecipe): string {
  return recipe.tags.map((t) => t.name).join(", ");
}

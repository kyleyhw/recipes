import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { Tin, TinShape } from "@/lib/tin";

/**
 * The on-disk recipe file: Markdown with YAML front matter.
 *
 * One file per recipe, in `content/recipes/<slug>.md`, and the file is the
 * source of truth — not a cache of a database, not an export. The point is that
 * a recipe should outlive this application, be readable in any text editor, and
 * produce a git diff a person can understand:
 *
 * ```diff
 * -- 180 g butter
 * ++ 220 g butter
 * ```
 *
 * That diff is the whole argument for the format. A JSON blob would encode the
 * same information and would produce a diff nobody wants to read.
 *
 * **Metadata in front matter, content in the body.** Ingredients and steps are
 * Markdown lists, so the file renders as a legible recipe on GitHub with no
 * tooling at all. Everything else — servings, timings, the original source — is
 * front matter, because it is data rather than prose.
 *
 * Pure: no filesystem, no network. Parsing and serialising are directly
 * testable, which matters more here than anywhere else in the application,
 * because a bug in this module corrupts the only copy of a recipe.
 */

/**
 * Front matter, validated.
 *
 * Deliberately close to the old `RecipeSnapshot`: the same fields travel, so a
 * file and a snapshot are the same thing written two ways.
 */
const frontMatterSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  category: z.string(),
  tags: z.array(z.string()).nullish(),
  servings: z.number().positive(),
  servingLabel: z.string().nullish(),
  prepMinutes: z.number().int().nullish(),
  cookMinutes: z.number().int().nullish(),
  /** The address a web-sourced recipe came from. */
  source: z.string().nullish(),
  photo: z.string().nullish(),
  photoCredit: z
    .object({
      siteName: z.string().nullish(),
      pageUrl: z.string().nullish(),
    })
    .nullish(),
  /** DRAFT recipes are Claude's proposals, not yet cooked here. */
  draft: z.boolean().nullish(),
  /**
   * The tin a baked recipe is written for. Required for anything baked, because
   * without it the recipe cannot be scaled honestly: doubling a batter into the
   * same tin doubles its depth and ruins the bake. See lib/tin.ts.
   */
  tin: z
    .object({
      shape: z.enum(["round", "square", "rectangular", "loaf"]),
      diameter: z.number().positive().nullish(),
      length: z.number().positive().nullish(),
      width: z.number().positive().nullish(),
      depth: z.number().positive().nullish(),
    })
    .nullish(),
});

export interface RecipeFile {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  servings: number;
  servingLabel: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string | null;
  photo: string | null;
  photoCredit: { siteName: string | null; pageUrl: string | null } | null;
  draft: boolean;
  /** The tin this is baked in, when it is baked. */
  tin: Tin | null;
  /** One ingredient per entry, as written. */
  ingredients: string[];
  /** One step per entry. */
  steps: string[];
  /** Free prose after the method: variations, warnings, what to look out for. */
  notes: string | null;
  /** How to keep it and how to bring it back. */
  storage: string | null;
  /** The cook's log, newest last. Dated lines. */
  log: LogEntry[];
}

export interface LogEntry {
  /** ISO date, day precision — the day you cooked it is what matters. */
  date: string;
  text: string;
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Section headings the body is split on. Matched case-insensitively. */
const HEADINGS = {
  ingredients: /^##\s+ingredients\s*$/i,
  method: /^##\s+method\s*$/i,
  notes: /^##\s+notes\s*$/i,
  /**
   * Storage and reheating gets its own section rather than living inside the
   * notes, because it is the part read on the *second* day, when the loaf is
   * already made and the question is only how to bring it back. Burying it in a
   * paragraph about ripe bananas is how it gets missed.
   */
  storage: /^##\s+(storage|storage and reheating|keeping)\s*$/i,
  log: /^##\s+log\s*$/i,
} as const;

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
}

export type ParseResult = { ok: true; recipe: RecipeFile } | { ok: false; error: string };

/**
 * Reads a recipe file.
 *
 * Never throws. A hand-edited file with a typo in it is an ordinary event — the
 * whole point of the format is that people edit these by hand — so the failure
 * has to be a message naming the file and the problem, not a crashed build.
 */
export function parseRecipeFile(slug: string, raw: string): ParseResult {
  const match = FRONT_MATTER.exec(raw);
  if (!match) {
    return { ok: false, error: "No front matter: the file must begin with a --- block." };
  }

  let frontMatter: unknown;
  try {
    frontMatter = parseYaml(match[1] ?? "");
  } catch (error) {
    return {
      ok: false,
      error: `The front matter is not valid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const parsed = frontMatterSchema.safeParse(frontMatter);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue
        ? `Front matter: ${issue.path.join(".") || "document"} ${issue.message.toLowerCase()}`
        : "The front matter is not in the expected shape.",
    };
  }

  const body = raw.slice(match[0].length);
  const sections = splitSections(body);

  return {
    ok: true,
    recipe: {
      slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      tags: parsed.data.tags ?? [],
      servings: parsed.data.servings,
      servingLabel: parsed.data.servingLabel ?? "serving",
      prepMinutes: parsed.data.prepMinutes ?? null,
      cookMinutes: parsed.data.cookMinutes ?? null,
      source: parsed.data.source ?? null,
      photo: parsed.data.photo ?? null,
      photoCredit: parsed.data.photoCredit
        ? {
            siteName: parsed.data.photoCredit.siteName ?? null,
            pageUrl: parsed.data.photoCredit.pageUrl ?? null,
          }
        : null,
      draft: parsed.data.draft ?? false,
      tin: parsed.data.tin
        ? {
            shape: parsed.data.tin.shape as TinShape,
            ...(parsed.data.tin.diameter ? { diameter: parsed.data.tin.diameter } : {}),
            ...(parsed.data.tin.length ? { length: parsed.data.tin.length } : {}),
            ...(parsed.data.tin.width ? { width: parsed.data.tin.width } : {}),
            ...(parsed.data.tin.depth ? { depth: parsed.data.tin.depth } : {}),
          }
        : null,
      ingredients: sections.ingredients.map(stripListMarker).filter(Boolean),
      steps: sections.steps.map(stripListMarker).filter(Boolean),
      notes: sections.notes.join("\n").trim() || null,
      storage: sections.storage.join("\n").trim() || null,
      log: parseLog(sections.log),
    },
  };
}

interface Sections {
  ingredients: string[];
  steps: string[];
  notes: string[];
  storage: string[];
  log: string[];
}

/**
 * Splits the body on its `##` headings.
 *
 * Lines before the first recognised heading are ignored rather than guessed at:
 * a stray paragraph at the top of the file is far more likely to be a note the
 * writer left themselves than an unlabelled ingredient list, and silently
 * promoting it to an ingredient would put it in the shopping list.
 */
function splitSections(body: string): Sections {
  const sections: Sections = {
    ingredients: [],
    steps: [],
    notes: [],
    storage: [],
    log: [],
  };
  let current: keyof Sections | null = null;

  for (const line of body.split("\n")) {
    if (HEADINGS.ingredients.test(line)) {
      current = "ingredients";
      continue;
    }
    if (HEADINGS.method.test(line)) {
      current = "steps";
      continue;
    }
    if (HEADINGS.notes.test(line)) {
      current = "notes";
      continue;
    }
    if (HEADINGS.storage.test(line)) {
      current = "storage";
      continue;
    }
    if (HEADINGS.log.test(line)) {
      current = "log";
      continue;
    }
    // Any other `##` heading ends the section it follows, rather than being
    // swallowed into it as an ingredient.
    if (/^##\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current && line.trim().length > 0) sections[current].push(line);
    // Blank lines are kept only in prose, where paragraphs matter.
    else if (current === "notes" || current === "storage") sections[current].push("");
  }

  return sections;
}

/**
 * Log lines are `- 2026-08-11: text`.
 *
 * A line with no recognisable date still becomes an entry, dated empty, rather
 * than being dropped. Losing what someone wrote because they typed the date
 * wrongly would be the worst possible response to a typo.
 */
function parseLog(lines: readonly string[]): LogEntry[] {
  return lines
    .map(stripListMarker)
    .filter(Boolean)
    .map((line) => {
      const dated = /^(\d{4}-\d{2}-\d{2})\s*[:—-]\s*(.*)$/.exec(line);
      return dated
        ? { date: dated[1] ?? "", text: (dated[2] ?? "").trim() }
        : { date: "", text: line };
    });
}

/**
 * Writes a recipe file.
 *
 * Field order is fixed and empty fields are omitted, so that saving an
 * unchanged recipe produces a byte-identical file. Without that, every save
 * would show as a diff and the git history — the entire reason for this format
 * — would be noise.
 */
export function serialiseRecipeFile(recipe: RecipeFile): string {
  const frontMatter: Record<string, unknown> = { title: recipe.title };
  if (recipe.description) frontMatter["description"] = recipe.description;
  frontMatter["category"] = recipe.category;
  if (recipe.tags.length > 0) frontMatter["tags"] = recipe.tags;
  frontMatter["servings"] = recipe.servings;
  if (recipe.servingLabel && recipe.servingLabel !== "serving") {
    frontMatter["servingLabel"] = recipe.servingLabel;
  }
  if (recipe.prepMinutes !== null) frontMatter["prepMinutes"] = recipe.prepMinutes;
  if (recipe.cookMinutes !== null) frontMatter["cookMinutes"] = recipe.cookMinutes;
  if (recipe.source) frontMatter["source"] = recipe.source;
  if (recipe.photo) frontMatter["photo"] = recipe.photo;
  if (recipe.photoCredit?.pageUrl || recipe.photoCredit?.siteName) {
    frontMatter["photoCredit"] = {
      ...(recipe.photoCredit.siteName ? { siteName: recipe.photoCredit.siteName } : {}),
      ...(recipe.photoCredit.pageUrl ? { pageUrl: recipe.photoCredit.pageUrl } : {}),
    };
  }
  if (recipe.draft) frontMatter["draft"] = true;
  if (recipe.tin) {
    frontMatter["tin"] = {
      shape: recipe.tin.shape,
      ...(recipe.tin.diameter ? { diameter: recipe.tin.diameter } : {}),
      ...(recipe.tin.length ? { length: recipe.tin.length } : {}),
      ...(recipe.tin.width ? { width: recipe.tin.width } : {}),
      ...(recipe.tin.depth ? { depth: recipe.tin.depth } : {}),
    };
  }

  const parts = [
    "---",
    stringifyYaml(frontMatter).trimEnd(),
    "---",
    "",
    "## Ingredients",
    "",
    ...recipe.ingredients.map((line) => `- ${line}`),
    "",
    "## Method",
    "",
    ...recipe.steps.map((step, index) => `${index + 1}. ${step}`),
  ];

  if (recipe.notes) {
    parts.push("", "## Notes", "", recipe.notes.trim());
  }

  if (recipe.storage) {
    parts.push("", "## Storage", "", recipe.storage.trim());
  }

  if (recipe.log.length > 0) {
    parts.push(
      "",
      "## Log",
      "",
      ...recipe.log.map((entry) =>
        entry.date ? `- ${entry.date}: ${entry.text}` : `- ${entry.text}`,
      ),
    );
  }

  return `${parts.join("\n")}\n`;
}

/** Filename for a recipe, derived from its slug. */
export function recipeFilename(slug: string): string {
  return `content/recipes/${slug}.md`;
}

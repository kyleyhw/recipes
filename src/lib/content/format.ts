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
  /**
   * Where the dish is from. Separate from the category because they answer
   * different questions: category is what kind of thing it is (a main, a
   * dessert), cuisine is whose it is. A Thai curry and a Thai salad share a
   * cuisine and nothing else.
   */
  cuisine: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  servings: z.number().positive(),
  servingLabel: z.string().nullish(),
  prepMinutes: z.number().int().nullish(),
  cookMinutes: z.number().int().nullish(),
  /**
   * What the second stretch of time actually is.
   *
   * "60 min cook" is wrong for a loaf, a terrine and a sorbet alike — they are
   * baked, chilled and frozen. The word is part of the information: it says
   * whether you have to be in the kitchen for it.
   *
   * Free text rather than an enum, because the list of things a recipe can
   * spend an hour doing is not enumerable in advance — proving, curing,
   * marinating, resting, smoking. Defaulted rather than required, and inferred
   * where the recipe already implies it.
   */
  cookLabel: z.string().nullish(),
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
  cuisine: string | null;
  tags: string[];
  servings: number;
  servingLabel: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** The verb for `cookMinutes`: "cook", "bake", "chill", "prove", "freeze". */
  cookLabel: string;
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
  /**
   * The method as a tree, as an indented outline.
   *
   * Kept as raw lines rather than parsed here, because parsing it needs the
   * ingredient list to link the leaves against, and this function's job is to
   * read one file rather than to relate its parts. See lib/content/diagram.ts.
   */
  diagram: string[];
  /** The cook's log, newest last. Dated lines. */
  log: LogEntry[];
  /**
   * The same recipe in other languages, keyed by code.
   *
   * Absent for a language nobody has generated yet, which is the ordinary case
   * for a recipe added since the last `npm run translate`. The interface falls
   * back to English for those, which is visibly incomplete rather than wrong.
   */
  translations: Record<string, RecipeTranslation>;
}

/**
 * A recipe, said again in another language.
 *
 * ## Why the ingredients are names and not lines
 *
 * A translation carries the *name* of each ingredient, not the whole line —
 * `несолёное сливочное масло`, not `115 г несолёного сливочного масла`. The
 * quantity is not text to be translated: it is a number this application
 * multiplies when you change the serving count, and a line with the amount
 * baked into it would be right at ten slices and quietly wrong at fifteen.
 *
 * So the arithmetic stays in one place and the display becomes
 * `<scaled amount> <translated unit> <translated name>`. The cost is that a
 * translation file does not read as a standalone recipe the way the English
 * one does. That is the trade, and it is the right way round: a recipe that
 * scales correctly in three languages beats four files that each read nicely
 * and two of which lie under scaling.
 *
 * The consequence is that the names must line up with the base recipe's
 * ingredients one for one, in the same order. A file that does not is rejected
 * with its count reported, rather than attached — a translation off by one
 * would put the wrong name against every quantity below the mistake, which is
 * far worse than no translation at all.
 *
 * Everything structural — servings, times, the tin, the category, the source —
 * is deliberately absent. It lives in the base file, and a translation must not
 * be able to change what the recipe *is*, only what it is called.
 */
export interface RecipeTranslation {
  title: string;
  description: string | null;
  /** What one serving is called: "slice", "ломтик", "片". */
  servingLabel: string | null;
  /** The verb for the cooking time, in this language. */
  cookLabel: string | null;
  tags: string[];
  /** Ingredient names, aligned one-to-one with the base recipe's. */
  ingredientNames: string[];
  steps: string[];
  notes: string | null;
  storage: string | null;
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
  /** The ingredients-and-operations tree. See lib/content/diagram.ts. */
  diagram: /^##\s+diagram\s*$/i,
  log: /^##\s+log\s*$/i,
} as const;

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
}

export type ParseResult = { ok: true; recipe: RecipeFile } | { ok: false; error: string };

export type TranslationParseResult =
  { ok: true; translation: RecipeTranslation } | { ok: false; error: string };

/** Front matter a translation may carry. Nothing structural: see the type. */
const translationFrontMatterSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  servingLabel: z.string().nullish(),
  cookLabel: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  /** Which English content this was made from. See scripts/translate.ts. */
  sourceHash: z.string().nullish(),
});

/**
 * Reads a translation file.
 *
 * `expectedIngredients` is not optional and not advisory. A translation with a
 * different number of ingredient names than the recipe it translates is
 * rejected here, because attaching it would put the wrong name against every
 * quantity after the mismatch — and it would look completely plausible while
 * doing so. A missing translation shows English, which is obvious; a
 * misaligned one shows confident nonsense.
 */
export function parseTranslationFile(
  raw: string,
  expectedIngredients: number,
): TranslationParseResult {
  const match = FRONT_MATTER.exec(raw);
  if (!match) return { ok: false, error: "no front matter" };

  let data: unknown;
  try {
    data = parseYaml(match[1] ?? "");
  } catch (error) {
    return { ok: false, error: `front matter is not valid YAML: ${String(error)}` };
  }

  const parsed = translationFrontMatterSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid front matter",
    };
  }

  const sections = splitSections(raw.slice(match[0].length));
  const ingredientNames = sections.ingredients.map(stripListMarker).filter(Boolean);

  if (ingredientNames.length !== expectedIngredients) {
    return {
      ok: false,
      error: `${ingredientNames.length} ingredient names for ${expectedIngredients} ingredients — a translation must line up one for one`,
    };
  }

  return {
    ok: true,
    translation: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      servingLabel: parsed.data.servingLabel ?? null,
      cookLabel: parsed.data.cookLabel ?? null,
      tags: parsed.data.tags ?? [],
      ingredientNames,
      steps: sections.steps.map(stripListMarker).filter(Boolean),
      notes: sections.notes.join("\n").trim() || null,
      storage: sections.storage.join("\n").trim() || null,
    },
  };
}

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
      cuisine: parsed.data.cuisine ?? null,
      tags: parsed.data.tags ?? [],
      servings: parsed.data.servings,
      servingLabel: parsed.data.servingLabel ?? "serving",
      prepMinutes: parsed.data.prepMinutes ?? null,
      cookMinutes: parsed.data.cookMinutes ?? null,
      // A recipe with a tin is baked in it — the tin is a stronger signal than
      // the category, which someone can file anywhere.
      cookLabel: parsed.data.cookLabel ?? (parsed.data.tin ? "bake" : "cook"),
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
      diagram: sections.diagram
        .map((line) => line.replace(/\s+$/, ""))
        .filter(
          (line, i, all) =>
            line.length > 0 || all.slice(i).some((rest) => rest.length > 0),
        ),
      log: parseLog(sections.log),
      // Filled in by the loader, which is the only thing that can see the
      // sibling files.
      translations: {},
    },
  };
}

interface Sections {
  ingredients: string[];
  steps: string[];
  notes: string[];
  storage: string[];
  diagram: string[];
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
    diagram: [],
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
    if (HEADINGS.diagram.test(line)) {
      current = "diagram";
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
  if (recipe.cuisine) frontMatter["cuisine"] = recipe.cuisine;
  if (recipe.tags.length > 0) frontMatter["tags"] = recipe.tags;
  frontMatter["servings"] = recipe.servings;
  if (recipe.servingLabel && recipe.servingLabel !== "serving") {
    frontMatter["servingLabel"] = recipe.servingLabel;
  }
  if (recipe.prepMinutes !== null) frontMatter["prepMinutes"] = recipe.prepMinutes;
  if (recipe.cookMinutes !== null) frontMatter["cookMinutes"] = recipe.cookMinutes;
  // Written out only when it is not what would be inferred anyway, so a file
  // stays as short as its recipe allows.
  if (recipe.cookLabel !== (recipe.tin ? "bake" : "cook")) {
    frontMatter["cookLabel"] = recipe.cookLabel;
  }
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

  if (recipe.diagram.length > 0) {
    // Verbatim: the indentation *is* the tree, so it cannot be reflowed.
    parts.push("", "## Diagram", "", ...recipe.diagram);
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

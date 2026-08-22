import { energySplit, type NutritionResult } from "@/lib/nutrition/compute";
import {
  formatNutrient,
  NUTRIENT_KEYS,
  NUTRIENTS,
  nutrientDef,
  type NutrientKey,
  type NutrientTotals,
} from "@/lib/nutrition/nutrients";
import { scaleRecipe, type ScalableIngredient } from "@/lib/scaling";

/**
 * Exactly what an export needs, and nothing else.
 *
 * Declared here rather than imported from the storage layer so that these
 * formats depend on no particular way of storing a recipe. That is what let
 * this module survive the move from a database to files with only its input
 * type changing.
 */
export interface ExportRecipe {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  servings: number;
  servingLabel: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  waitMinutes: number | null;
  waitLabel: string;
  source: string | null;
  photo: string | null;
  ingredients: ScalableIngredient[];
  steps: string[];
  /**
   * Who added the recipe to the collection, from its git history.
   *
   * Optional because an export can be produced from a recipe that has no
   * history yet — one being previewed before it is committed — and because
   * schema.org's `author` must be absent rather than empty when unknown. It is
   * a name and a profile, never an address: see lib/content/attribution.ts.
   */
  author?: { name: string; url: string | null } | null;
}

/**
 * Export formats.
 *
 * The application computes macros so that a tracker can consume them; it does
 * not track intake itself. Export is therefore a primary interface, and each
 * format exists because a different consumer needs a different shape:
 *
 *   json     — this application's own canonical machine format
 *   json-ld  — schema.org Recipe, what third-party importers actually parse
 *   csv      — ingredient rows with masses and macros, for a spreadsheet
 *   text     — a plaintext block for pasting into a tracker's recipe importer
 *
 * Every format honours a target serving count, so what is exported is what is
 * being cooked.
 */

export type ExportFormat = "json" | "json-ld" | "csv" | "text";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["json", "json-ld", "csv", "text"];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  json: "application/json; charset=utf-8",
  "json-ld": "application/ld+json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  text: "text/plain; charset=utf-8",
};

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Every nutrient as a plain object, rounded to its own precision.
 *
 * Driven off the table rather than listed here, so a nutrient added to
 * `lib/nutrition/nutrients.ts` appears in the export the same day rather than
 * whenever someone remembers this file exists.
 */
function everyNutrient(totals: NutrientTotals): Record<string, number> {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, Number(formatNutrient(key, totals[key]))]),
  );
}

/** ISO 8601 duration, which is what schema.org requires for times. */
function isoDuration(minutes: number | null): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `PT${hours > 0 ? `${hours}H` : ""}${rest > 0 ? `${rest}M` : ""}`;
}

/** The canonical machine format. */
export function toJson(
  recipe: ExportRecipe,
  nutrition: NutritionResult,
  servings: number,
): unknown {
  const scaled = scaleRecipe(recipe.ingredients, recipe.servings, servings, {
    cookMinutes: recipe.cookMinutes,
  });

  return {
    title: recipe.title,
    description: recipe.description,
    category: recipe.category,
    tags: recipe.tags,
    servings,
    servingLabel: recipe.servingLabel,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    waitMinutes: recipe.waitMinutes,
    waitLabel: recipe.waitMinutes === null ? null : recipe.waitLabel,
    sourceUrl: recipe.source,
    addedBy: recipe.author ?? null,
    ingredients: scaled.ingredients.map((row) => ({
      text: row.passedThrough ? row.rawText : row.display,
      name: row.name,
      quantity: row.scaledQuantity,
      unit: row.unit,
      optional: row.optional,
      scaled: !row.passedThrough,
    })),
    steps: recipe.steps,
    nutrition: {
      // Every nutrient in the table, per serving and in total, so a consumer
      // does not have to know which subset this application happened to
      // consider interesting on the day it was written.
      perServing: everyNutrient(nutrition.perServing),
      total: everyNutrient(nutrition.total),
      // Exported alongside the figures rather than omitted, so a consumer can
      // see that a number was computed from part of the recipe. A tracker that
      // ignores it is no worse off; one that reads it can warn. Per nutrient as
      // well as overall: a zinc figure and a protein figure from the same
      // recipe are not usually backed by the same share of its mass.
      coverage: round(nutrition.coverage, 3),
      nutrientCoverage: Object.fromEntries(
        NUTRIENT_KEYS.map((key) => [key, round(nutrition.nutrientCoverage[key], 3)]),
      ),
      units: Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.unit])),
      unresolvedIngredients: nutrition.contributions
        .filter((c) => c.gap === "unresolved")
        .map((c) => c.name),
    },
    advisories: scaled.advisories.map((a) => a.text),
  };
}

/**
 * schema.org Recipe as JSON-LD.
 *
 * This is what most third-party importers parse, and it is the same shape this
 * application reads when importing from a URL — so a recipe exported here can
 * be imported by another instance, or by any other tool that speaks the format.
 */
export function toJsonLd(
  recipe: ExportRecipe,
  nutrition: NutritionResult,
  servings: number,
  origin: string | null,
): unknown {
  const scaled = scaleRecipe(recipe.ingredients, recipe.servings, servings);

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description ?? undefined,
    // Whoever added it to this collection, which is what this document can
    // honestly claim. Where the dish itself came from is `url`, below.
    author: recipe.author
      ? {
          "@type": "Person",
          name: recipe.author.name,
          url: recipe.author.url ?? undefined,
        }
      : undefined,
    recipeCategory: recipe.category,
    keywords: recipe.tags.join(", ") || undefined,
    recipeYield: `${servings} ${recipe.servingLabel}${servings === 1 ? "" : "s"}`,
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(recipe.cookMinutes),
    // Schema.org has no field for unattended time, so it goes into the total
    // and nowhere else. An importer reading this gets the honest answer to
    // "how long does this take", which is the only question totalTime asks.
    totalTime: isoDuration(
      (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0) + (recipe.waitMinutes ?? 0),
    ),
    recipeIngredient: scaled.ingredients.map((row) =>
      row.passedThrough ? row.rawText : row.display,
    ),
    recipeInstructions: recipe.steps.map((step) => ({
      "@type": "HowToStep",
      text: step,
    })),
    image: recipe.photo
      ? recipe.photo.startsWith("http")
        ? recipe.photo
        : origin
          ? `${origin}${recipe.photo}`
          : undefined
      : undefined,
    url: recipe.source ?? (origin ? `${origin}/recipes/${recipe.slug}` : undefined),
    // schema.org NutritionInformation is per serving by definition, and its
    // values are strings with units — not numbers.
    //
    // This is every property the vocabulary defines that this application
    // computes. The vitamins and minerals have no schema.org property at all,
    // and inventing one would produce a document that validates as Recipe while
    // carrying fields no consumer reads — so they are simply absent here, and
    // the JSON and CSV exports are where the full table lives.
    nutrition: {
      "@type": "NutritionInformation",
      servingSize: `1 ${recipe.servingLabel}`,
      calories: `${round(nutrition.perServing.kcal, 0)} kcal`,
      proteinContent: `${round(nutrition.perServing.protein)} g`,
      carbohydrateContent: `${round(nutrition.perServing.carbs)} g`,
      fatContent: `${round(nutrition.perServing.fat)} g`,
      saturatedFatContent: `${round(nutrition.perServing.satFat)} g`,
      fiberContent: `${round(nutrition.perServing.fiber)} g`,
      sugarContent: `${round(nutrition.perServing.sugar)} g`,
      cholesterolContent: `${round(nutrition.perServing.cholesterolMg, 0)} mg`,
      sodiumContent: `${round(nutrition.perServing.sodiumMg, 0)} mg`,
    },
  };
}

/** RFC 4180 quoting: wrap in quotes and double any internal quote. */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Ingredient rows with mass and macros, for a spreadsheet.
 *
 * Unresolved ingredients appear as rows with empty macro cells rather than
 * being omitted — a spreadsheet showing 8 of 12 ingredients would silently
 * misstate the recipe.
 */
export function toCsv(recipe: ExportRecipe, nutrition: NutritionResult): string {
  // One column per nutrient, named with its unit so a spreadsheet cell is
  // unambiguous without a legend. Generated from the table, so the header and
  // the rows cannot drift apart.
  const nutrientColumns = NUTRIENT_KEYS.map((key) => {
    const { unit } = nutrientDef(key);
    if (unit === "kcal") return "kcal";
    // "ug" rather than "µg": a header row is a column name, and a non-ASCII
    // one survives a spreadsheet import less reliably than it reads.
    return `${csvColumnName(key)}_${unit === "µg" ? "ug" : unit}`;
  });

  const header = ["ingredient", "as_written", "grams", ...nutrientColumns, "status"];

  const rows = nutrition.contributions.map((c) => [
    csvCell(c.name),
    csvCell(c.rawText),
    csvCell(c.grams === null ? null : round(c.grams)),
    // An empty cell is *unknown*. A resolved ingredient with no zinc figure and
    // one with genuinely no zinc must not look the same in a spreadsheet.
    ...NUTRIENT_KEYS.map((key) => {
      const value = c.macros?.[key];
      return csvCell(value == null ? null : Number(formatNutrient(key, value)));
    }),
    csvCell(c.gap ?? "resolved"),
  ]);

  const totals = [
    csvCell("TOTAL"),
    csvCell(recipe.title),
    csvCell(round(nutrition.determinableGrams)),
    ...NUTRIENT_KEYS.map((key) =>
      csvCell(Number(formatNutrient(key, nutrition.total[key]))),
    ),
    csvCell(`coverage ${Math.round(nutrition.coverage * 100)}%`),
  ];

  // The coverage row is what stops the totals row from being read as complete.
  const coverageRow = [
    csvCell("COVERAGE"),
    csvCell("share of determinable mass carrying a figure"),
    csvCell(round(nutrition.determinableGrams)),
    ...NUTRIENT_KEYS.map((key) => csvCell(round(nutrition.nutrientCoverage[key], 3))),
    csvCell(""),
  ];

  return [header, ...rows, totals, coverageRow].map((row) => row.join(",")).join("\n");
}

/** snake_case, so the header is usable as a column name in a spreadsheet. */
function csvColumnName(key: NutrientKey): string {
  return key
    .replace(/Mg$|Ug$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Plaintext block for a tracker's recipe importer.
 *
 * MyFitnessPal and similar accept a pasted ingredient list with a serving
 * count, then match the ingredients themselves. Quantities are given at the
 * scale being cooked, and the per-serving figures follow so they can be entered
 * directly where an importer is unavailable.
 */
export function toTrackerText(
  recipe: ExportRecipe,
  nutrition: NutritionResult,
  servings: number,
): string {
  const scaled = scaleRecipe(recipe.ingredients, recipe.servings, servings);
  const split = energySplit(nutrition.perServing);

  const lines: string[] = [
    recipe.title,
    `Servings: ${servings}`,
    "",
    "Ingredients:",
    ...scaled.ingredients.map(
      (row) => `- ${row.passedThrough ? row.rawText : row.display}`,
    ),
    "",
    `Per ${recipe.servingLabel}:`,
    `Calories: ${round(nutrition.perServing.kcal, 0)} kcal`,
    `Protein: ${round(nutrition.perServing.protein)} g (${round(split.proteinPct, 0)}% of energy)`,
    `Carbohydrate: ${round(nutrition.perServing.carbs)} g (${round(split.carbsPct, 0)}%)`,
    `Fat: ${round(nutrition.perServing.fat)} g (${round(split.fatPct, 0)}%)`,
  ];

  // Everything else the table knows, minus the four already printed above and
  // anything with no data at all — a block of "Zinc: 0 mg" would be a list of
  // things this recipe does not contain, which is not what a zero means here.
  const printed = new Set<NutrientKey>(["kcal", "protein", "carbs", "fat"]);
  for (const key of NUTRIENT_KEYS) {
    const def = nutrientDef(key);
    if (printed.has(key)) continue;
    if (nutrition.nutrientCoverage[key] <= 0) continue;
    const label = def.subordinate ? def.label.replace(/^of which /, "") : def.label;
    const share =
      nutrition.nutrientCoverage[key] < 1
        ? ` (from ${Math.round(nutrition.nutrientCoverage[key] * 100)}% of the mass)`
        : "";
    lines.push(
      `${label[0]?.toUpperCase()}${label.slice(1)}: ${formatNutrient(
        key,
        nutrition.perServing[key],
      )} ${def.unit}${share}`,
    );
  }

  if (nutrition.coverage < 1) {
    lines.push(
      "",
      `Note: these figures cover ${Math.round(nutrition.coverage * 100)}% of the recipe by mass. ` +
        `Unmatched: ${
          nutrition.contributions
            .filter((c) => c.gap === "unresolved")
            .map((c) => c.name)
            .join(", ") || "none"
        }.`,
    );
  }

  return lines.join("\n");
}

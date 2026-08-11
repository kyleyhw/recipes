import { energySplit, type NutritionResult } from "@/lib/nutrition/compute";
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
  source: string | null;
  photo: string | null;
  ingredients: ScalableIngredient[];
  steps: string[];
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
    sourceUrl: recipe.source,
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
      perServing: {
        kcal: round(nutrition.perServing.kcal),
        protein: round(nutrition.perServing.protein),
        carbs: round(nutrition.perServing.carbs),
        fat: round(nutrition.perServing.fat),
        fiber: round(nutrition.perServing.fiber),
        sugar: round(nutrition.perServing.sugar),
        sodiumMg: round(nutrition.perServing.sodiumMg),
      },
      total: {
        kcal: round(nutrition.total.kcal),
        protein: round(nutrition.total.protein),
        carbs: round(nutrition.total.carbs),
        fat: round(nutrition.total.fat),
      },
      // Exported alongside the figures rather than omitted, so a consumer can
      // see that a number was computed from part of the recipe. A tracker that
      // ignores it is no worse off; one that reads it can warn.
      coverage: round(nutrition.coverage, 3),
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
    recipeCategory: recipe.category,
    keywords: recipe.tags.join(", ") || undefined,
    recipeYield: `${servings} ${recipe.servingLabel}${servings === 1 ? "" : "s"}`,
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(recipe.cookMinutes),
    totalTime: isoDuration((recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)),
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
    nutrition: {
      "@type": "NutritionInformation",
      servingSize: `1 ${recipe.servingLabel}`,
      calories: `${round(nutrition.perServing.kcal, 0)} kcal`,
      proteinContent: `${round(nutrition.perServing.protein)} g`,
      carbohydrateContent: `${round(nutrition.perServing.carbs)} g`,
      fatContent: `${round(nutrition.perServing.fat)} g`,
      fiberContent: `${round(nutrition.perServing.fiber)} g`,
      sugarContent: `${round(nutrition.perServing.sugar)} g`,
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
  const header = [
    "ingredient",
    "as_written",
    "grams",
    "kcal",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "status",
  ];

  const rows = nutrition.contributions.map((c) => [
    csvCell(c.name),
    csvCell(c.rawText),
    csvCell(c.grams === null ? null : round(c.grams)),
    csvCell(c.macros ? round(c.macros.kcal) : null),
    csvCell(c.macros ? round(c.macros.protein) : null),
    csvCell(c.macros ? round(c.macros.carbs) : null),
    csvCell(c.macros ? round(c.macros.fat) : null),
    csvCell(c.macros?.fiber != null ? round(c.macros.fiber) : null),
    csvCell(c.macros?.sugar != null ? round(c.macros.sugar) : null),
    csvCell(c.macros?.sodiumMg != null ? round(c.macros.sodiumMg) : null),
    csvCell(c.gap ?? "resolved"),
  ]);

  const totals = [
    csvCell("TOTAL"),
    csvCell(recipe.title),
    csvCell(round(nutrition.determinableGrams)),
    csvCell(round(nutrition.total.kcal)),
    csvCell(round(nutrition.total.protein)),
    csvCell(round(nutrition.total.carbs)),
    csvCell(round(nutrition.total.fat)),
    csvCell(round(nutrition.total.fiber)),
    csvCell(round(nutrition.total.sugar)),
    csvCell(round(nutrition.total.sodiumMg)),
    csvCell(`coverage ${Math.round(nutrition.coverage * 100)}%`),
  ];

  return [header, ...rows, totals].map((row) => row.join(",")).join("\n");
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
    `Fibre: ${round(nutrition.perServing.fiber)} g`,
    `Sugar: ${round(nutrition.perServing.sugar)} g`,
    `Sodium: ${round(nutrition.perServing.sodiumMg, 0)} mg`,
  ];

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

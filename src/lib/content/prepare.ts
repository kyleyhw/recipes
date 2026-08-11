import type { RecipeFile } from "@/lib/content/format";
import type { LibraryIngredient } from "@/lib/content/library";
import { parseIngredientLine } from "@/lib/ingredient-parser";
import { computeNutrition, type NutritionInput } from "@/lib/nutrition/compute";
import type { ScalableIngredient } from "@/lib/scaling";

/**
 * Turning a recipe file into the shapes the pure modules already take.
 *
 * The scaling and nutrition modules were written against plain data with no
 * database in sight, which is why they survive this re-platform untouched:
 * `scaleRecipe` and `computeNutrition` neither know nor care whether their
 * input came from Postgres or from a Markdown file. This module is the adapter,
 * and it is the whole of the porting cost.
 *
 * Resolution against the ingredient library happens here, at build time, by
 * name. There is no USDA call and no model call at request time because there
 * are no requests: the site is static, so an ingredient either matches the
 * committed library or is reported as a coverage gap.
 */

/** Normalises for matching: case, punctuation, and preparation words. */
const PREP_WORDS = new Set([
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "crushed",
  "melted",
  "softened",
  "beaten",
  "peeled",
  "trimmed",
  "finely",
  "roughly",
  "coarsely",
  "thinly",
  "freshly",
  "fresh",
  "large",
  "medium",
  "small",
  "ripe",
  "raw",
  "cooked",
  "warm",
  "cold",
  "packed",
  "level",
  "heaped",
  "optional",
  "plus",
  "extra",
  "ground",
  "dried",
  "whole",
  "fine",
]);

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !PREP_WORDS.has(word))
    .join(" ")
    .trim();
}

/**
 * Matches an ingredient line to the library.
 *
 * Exact on the normalised name, then on the name as written, then on a
 * singularised form. Deliberately conservative and free of fuzzy matching: the
 * trigram index that made fuzzy matching safe lived in Postgres, and a loose
 * string match without it would attach the wrong nutrition data — worse than no
 * match, because a gap is visible and a wrong figure is not.
 */
export function matchIngredient(
  name: string,
  library: readonly LibraryIngredient[],
): LibraryIngredient | null {
  const normalised = normaliseName(name);
  const candidates = [
    normalised,
    name.trim().toLowerCase(),
    normalised.replace(/s$/, ""),
  ];

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    const found = library.find(
      (ingredient) => ingredient.name.toLowerCase() === candidate,
    );
    if (found) return found;
  }
  return null;
}

export interface PreparedRecipe {
  /** Ingredients in the shape `scaleRecipe` takes. */
  scalable: ScalableIngredient[];
  /** Ingredients in the shape `computeNutrition` takes. */
  nutrition: NutritionInput[];
}

/**
 * Parses every ingredient line once and produces both views of it.
 *
 * One parse, two consumers: the scaling view and the nutrition view must agree
 * about what quantity a line states, or a recipe would scale by one number and
 * compute macros from another.
 */
export function prepareRecipe(
  recipe: RecipeFile,
  library: readonly LibraryIngredient[],
): PreparedRecipe {
  const scalable: ScalableIngredient[] = [];
  const nutrition: NutritionInput[] = [];

  recipe.ingredients.forEach((line, index) => {
    const parsed = parseIngredientLine(line);
    // Index-based so the id is stable across builds of the same file, which
    // keeps React keys and the exported JSON deterministic.
    const id = `${recipe.slug}-${index}`;
    const match = matchIngredient(parsed.name, library);

    scalable.push({
      id,
      rawText: parsed.rawText,
      quantity: parsed.quantity,
      unit: parsed.unit,
      name: parsed.name,
      prepNote: parsed.prepNote,
      optional: parsed.optional,
      scalable: parsed.scalable,
    });

    nutrition.push({
      id,
      name: parsed.name,
      rawText: parsed.rawText,
      quantity: parsed.quantity,
      unit: parsed.unit,
      optional: parsed.optional,
      gramsOverride: null,
      macro: match
        ? {
            kcal: match.kcal100g,
            protein: match.protein100g,
            carbs: match.carbs100g,
            fat: match.fat100g,
            fiber: match.fiber100g ?? null,
            sugar: match.sugar100g ?? null,
            sodiumMg: match.sodiumMg100g ?? null,
          }
        : null,
      densityGPerMl: match?.densityGPerMl ?? null,
      gramsPerUnit: match?.gramsPerUnit ?? null,
    });
  });

  return { scalable, nutrition };
}

/** Nutrition for a recipe at its base serving count. */
export function nutritionFor(recipe: RecipeFile, library: readonly LibraryIngredient[]) {
  return computeNutrition(prepareRecipe(recipe, library).nutrition, recipe.servings);
}

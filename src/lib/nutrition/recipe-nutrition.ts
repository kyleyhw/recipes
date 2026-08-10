import "server-only";
import {
  computeNutrition,
  type NutritionInput,
  type NutritionResult,
} from "@/lib/nutrition/compute";
import type { FullRecipe } from "@/lib/recipes";

/**
 * Bridges a stored recipe to the pure aggregation function.
 *
 * Kept separate from `compute.ts` so that module stays free of Prisma types and
 * therefore directly testable with plain objects.
 */
export function nutritionInputsFor(recipe: FullRecipe): NutritionInput[] {
  return recipe.ingredients.map((row) => ({
    id: row.id,
    name: row.name,
    rawText: row.rawText,
    quantity: row.quantity,
    unit: row.unit,
    optional: row.optional,
    gramsOverride: row.gramsOverride,
    macro: row.ingredient
      ? {
          kcal: row.ingredient.kcal100g,
          protein: row.ingredient.protein100g,
          carbs: row.ingredient.carbs100g,
          fat: row.ingredient.fat100g,
          fiber: row.ingredient.fiber100g,
          sugar: row.ingredient.sugar100g,
          sodiumMg: row.ingredient.sodiumMg100g,
        }
      : null,
    densityGPerMl: row.ingredient?.densityGPerMl ?? null,
    gramsPerUnit: row.ingredient?.gramsPerUnit ?? null,
  }));
}

/**
 * Nutrition for a recipe at a given serving count.
 *
 * Note that `scale` and the serving count move together, which is exactly why
 * the per-serving figures are invariant: this function returns the same
 * per-serving numbers whatever `targetServings` is, and only the totals change.
 */
export function nutritionFor(
  recipe: FullRecipe,
  targetServings?: number,
): NutritionResult {
  const base = recipe.baseServings > 0 ? recipe.baseServings : 1;
  const target = targetServings && targetServings > 0 ? targetServings : base;
  return computeNutrition(nutritionInputsFor(recipe), base, { scale: target / base });
}

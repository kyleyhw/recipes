import "server-only";
import { callWithTool } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/pricing";
import { foodChoiceSchema, foodEstimateSchema } from "@/lib/ai/schemas";
import { features } from "@/lib/env";
import type { UsdaCandidate } from "@/lib/nutrition/usda";

/**
 * Claude's two roles in the nutrition pipeline.
 *
 * Both sit at the *end* of the resolution chain in `lib/nutrition/resolve.ts`,
 * after the local library and the trigram index have failed, so they run once
 * per genuinely new ingredient and never again: the canonical `Ingredient`
 * table caches the result for every recipe that follows.
 *
 * **Choosing.** FoodData Central's search returns a ranked list in which the
 * top hit is frequently not the ingredient — "butter" returns dozens of
 * branded compound products before plain unsalted butter. Choosing among the
 * candidates is a judgement about food, which is exactly the kind of judgement
 * a ranking function is bad at. The model also supplies rho and mu, the density
 * and per-item mass that FDC does not record and without which a cup or a count
 * cannot be converted to grams at all.
 *
 * **Estimating.** When FDC has no record — or when no USDA key is configured —
 * the alternative to an estimate is a permanent coverage gap. The estimate is
 * stored with `source: CLAUDE` and the basis it was derived from, so it is
 * visibly an estimate wherever it appears and can be corrected once, in the
 * ingredient library, for every recipe at once.
 *
 * Both use the cheap model. Neither composes anything: one selects from a given
 * list, the other recalls a composition. Spending the reasoning model's price
 * on either would buy nothing.
 */

export interface ChosenFood {
  candidate: UsdaCandidate;
  confidence: "high" | "medium" | "low";
  reason: string;
  densityGPerMl: number | null;
  gramsPerUnit: number | null;
}

/**
 * Picks the candidate that is actually the ingredient.
 *
 * Returns null when the model rejects all of them, and that is the useful
 * answer: an unresolved ingredient is reported as a coverage gap, whereas a
 * wrong match silently poisons every macro figure derived from it, in every
 * recipe using it, with no indication that anything is wrong.
 */
export async function chooseUsdaCandidate(
  ingredientName: string,
  candidates: readonly UsdaCandidate[],
): Promise<ChosenFood | null> {
  if (!features.ai || candidates.length === 0) return null;

  const listing = candidates
    .map(
      (candidate, index) =>
        `${index}. ${candidate.description} [${candidate.dataType ?? "unknown type"}] ` +
        `— ${candidate.macro.kcal} kcal, ${candidate.macro.protein} g protein, ` +
        `${candidate.macro.carbs} g carbohydrate, ${candidate.macro.fat} g fat per 100 g`,
    )
    .join("\n");

  const result = await callWithTool({
    kind: "MACRO_MATCH",
    system: [
      "You match ingredient names from recipes to USDA FoodData Central records.",
      "",
      "Choose the candidate that is the ingredient as a cook would buy it: plain,",
      "unprepared, unbranded, and raw unless the recipe line says otherwise.",
      "Prefer a generic record over a branded one. Prefer 'raw' over 'cooked'",
      "unless the ingredient line specifies cooked.",
      "",
      "If none of the candidates is this ingredient, answer -1. That is a better",
      "answer than a near miss: an unmatched ingredient is reported as a gap,",
      "while a wrong match silently corrupts the recipe's nutrition figures.",
      "",
      "Also give the density and per-item mass where they apply. USDA does not",
      "record either, and without them a volume or a count cannot be converted to",
      "a mass at all.",
    ].join("\n"),
    prompt: [
      `Ingredient line name: "${ingredientName}"`,
      "",
      "Candidates:",
      listing,
    ].join("\n"),
    tool: {
      name: "choose_food",
      description: "Record which candidate is this ingredient. Call this exactly once.",
      schema: foodChoiceSchema,
    },
    model: MODELS.cheap,
    effort: "low",
    maxTokens: 2_000,
  });

  if (!result.ok) return null;

  const chosen = candidates[result.data.choiceIndex];
  if (!chosen) return null;

  return {
    candidate: chosen,
    confidence: result.data.confidence,
    reason: result.data.reason,
    densityGPerMl: positiveOrNull(result.data.densityGPerMl),
    gramsPerUnit: positiveOrNull(result.data.gramsPerUnit),
  };
}

export interface EstimatedFood {
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  fiber100g: number | null;
  sugar100g: number | null;
  sodiumMg100g: number | null;
  densityGPerMl: number | null;
  gramsPerUnit: number | null;
  basis: string;
}

/** Estimates macros for an ingredient no database has. Null when it declines. */
export async function estimateMacros(
  ingredientName: string,
): Promise<EstimatedFood | null> {
  if (!features.ai) return null;

  const result = await callWithTool({
    kind: "MACRO_MATCH",
    system: [
      "You give the nutritional composition of ingredients, per 100 g as purchased.",
      "",
      "Give the composition you would find on a reference table or a package, not a",
      "guess dressed as one. If you do not know the ingredient, or it is not food,",
      "say so instead of estimating.",
      "",
      "Name what your figures are based on. That line is stored against the",
      "ingredient permanently and is what makes a suspicious number traceable.",
    ].join("\n"),
    prompt: `Ingredient: "${ingredientName}"`,
    tool: {
      name: "estimate_composition",
      description:
        "Record the composition of this ingredient per 100 g. Call this exactly once.",
      schema: foodEstimateSchema,
    },
    model: MODELS.cheap,
    effort: "low",
    maxTokens: 2_000,
  });

  if (!result.ok || !result.data.isFood) return null;

  const estimate = result.data;
  // A negative or non-finite figure would propagate into every total derived
  // from this ingredient. The schema constrains the type, not the range.
  if (
    ![
      estimate.kcal100g,
      estimate.protein100g,
      estimate.carbs100g,
      estimate.fat100g,
    ].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    return null;
  }

  return {
    kcal100g: estimate.kcal100g,
    protein100g: estimate.protein100g,
    carbs100g: estimate.carbs100g,
    fat100g: estimate.fat100g,
    fiber100g: nonNegativeOrNull(estimate.fiber100g),
    sugar100g: nonNegativeOrNull(estimate.sugar100g),
    sodiumMg100g: nonNegativeOrNull(estimate.sodiumMg100g),
    densityGPerMl: positiveOrNull(estimate.densityGPerMl),
    gramsPerUnit: positiveOrNull(estimate.gramsPerUnit),
    basis: estimate.basis,
  };
}

function positiveOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

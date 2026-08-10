/**
 * Macronutrient aggregation and coverage.
 *
 * Implements §3 of docs/mathematics.md. Pure: no database, no network, no clock.
 */

import { toGrams } from "@/lib/units";

/** The per-100 g macro vector m_i. */
export interface MacroVector {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  sodiumMg: number | null;
}

/** An ingredient row as the nutrition pipeline needs it. */
export interface NutritionInput {
  id: string;
  name: string;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  optional: boolean;
  /** Owner-supplied gram mass, bypassing unit conversion entirely. */
  gramsOverride: number | null;
  /** Null when the ingredient has not been resolved to the canonical library. */
  macro: MacroVector | null;
  densityGPerMl: number | null;
  gramsPerUnit: number | null;
}

/**
 * Why an ingredient contributes nothing.
 *
 * The distinction matters and is surfaced, because "we know its mass but not
 * its nutrition" and "we cannot even determine its mass" are different failures
 * with different remedies.
 */
export type GapReason =
  | "no-quantity" // the line states no amount ("salt to taste")
  | "unresolved" // mass known, but no macro data matched
  | "mass-unknown"; // no rho or mu, so the mass itself is undeterminable

export interface IngredientContribution {
  id: string;
  name: string;
  rawText: string;
  /** Mass in grams, or null when undeterminable. */
  grams: number | null;
  /** This ingredient's contribution to the totals; null when it has none. */
  macros: MacroVector | null;
  gap: GapReason | null;
}

export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodiumMg: number;
}

export interface NutritionResult {
  /** Totals for the whole recipe at the given scale. */
  total: MacroTotals;
  /** Totals divided by the serving count. */
  perServing: MacroTotals;
  contributions: IngredientContribution[];

  /**
   * Mass coverage c: the fraction of *determinable* mass that carries macro
   * data.
   *
   * Mass-weighted rather than a count, because counting weights a pinch of salt
   * equally with 500 g of flour — "10 of 12 matched" can describe a total that
   * is either essentially complete or essentially meaningless.
   */
  coverage: number;
  /** Grams of determinable mass carrying macro data. */
  resolvedGrams: number;
  /** Total determinable mass. */
  determinableGrams: number;
  /**
   * Ingredients whose mass could not be determined at all.
   *
   * These cannot enter the coverage denominator without inventing a figure, so
   * they are reported separately as a count. Neither number alone is the whole
   * truth, which is why the interface shows both.
   */
  massUnknownCount: number;
  /** Ingredients with no stated quantity, e.g. "salt to taste". */
  noQuantityCount: number;
}

const ZERO: MacroTotals = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodiumMg: 0,
};

/** Mass of one ingredient, or null when it cannot be determined. */
function ingredientGrams(input: NutritionInput): number | null {
  // An explicit override wins over any inference: it is the escape hatch for
  // cases where rho or mu is unknown or wrong for this particular use.
  if (typeof input.gramsOverride === "number" && input.gramsOverride > 0) {
    return input.gramsOverride;
  }
  if (input.quantity === null) return null;
  return toGrams(input.quantity, input.unit, {
    densityGPerMl: input.densityGPerMl,
    gramsPerUnit: input.gramsPerUnit,
  });
}

/**
 * Aggregates macros over a recipe's ingredients.
 *
 * `scale` multiplies every mass, exactly as portion scaling does. Because the
 * serving count is scaled by the same factor, per-serving macros are invariant
 * under it — an exact identity, asserted as a property test.
 *
 * Optional ingredients are excluded by default. They are genuinely optional, so
 * including them would overstate the figures a tracker receives.
 */
export function computeNutrition(
  inputs: readonly NutritionInput[],
  servings: number,
  options: { scale?: number; includeOptional?: boolean } = {},
): NutritionResult {
  const scale = options.scale ?? 1;
  const includeOptional = options.includeOptional ?? false;

  const total: MacroTotals = { ...ZERO };
  const contributions: IngredientContribution[] = [];

  let resolvedGrams = 0;
  let determinableGrams = 0;
  let massUnknownCount = 0;
  let noQuantityCount = 0;

  for (const input of inputs) {
    if (input.optional && !includeOptional) {
      contributions.push({
        id: input.id,
        name: input.name,
        rawText: input.rawText,
        grams: null,
        macros: null,
        gap: null,
      });
      continue;
    }

    const baseGrams = ingredientGrams(input);
    const grams = baseGrams === null ? null : baseGrams * scale;

    if (grams === null) {
      // Distinguish "no amount stated" from "amount stated but unconvertible":
      // the first is a property of the recipe, the second of our data.
      const gap: GapReason = input.quantity === null ? "no-quantity" : "mass-unknown";
      if (gap === "no-quantity") noQuantityCount += 1;
      else massUnknownCount += 1;

      contributions.push({
        id: input.id,
        name: input.name,
        rawText: input.rawText,
        grams: null,
        macros: null,
        gap,
      });
      continue;
    }

    determinableGrams += grams;

    if (input.macro === null) {
      // Mass known, nutrition unknown. Contributes to the coverage denominator
      // but not the numerator, and contributes nothing to the totals — it is
      // never treated as nutritionally zero.
      contributions.push({
        id: input.id,
        name: input.name,
        rawText: input.rawText,
        grams,
        macros: null,
        gap: "unresolved",
      });
      continue;
    }

    resolvedGrams += grams;

    // M = sum_i (g_i / 100) * m_i
    const factor = grams / 100;
    const macros: MacroVector = {
      kcal: input.macro.kcal * factor,
      protein: input.macro.protein * factor,
      carbs: input.macro.carbs * factor,
      fat: input.macro.fat * factor,
      fiber: input.macro.fiber === null ? null : input.macro.fiber * factor,
      sugar: input.macro.sugar === null ? null : input.macro.sugar * factor,
      sodiumMg: input.macro.sodiumMg === null ? null : input.macro.sodiumMg * factor,
    };

    total.kcal += macros.kcal;
    total.protein += macros.protein;
    total.carbs += macros.carbs;
    total.fat += macros.fat;
    // A null micronutrient is unknown, not zero; it simply does not add. The
    // total is therefore a lower bound for those fields, which is the honest
    // reading and is stated in the interface.
    total.fiber += macros.fiber ?? 0;
    total.sugar += macros.sugar ?? 0;
    total.sodiumMg += macros.sodiumMg ?? 0;

    contributions.push({
      id: input.id,
      name: input.name,
      rawText: input.rawText,
      grams,
      macros,
      gap: null,
    });
  }

  const scaledServings = servings > 0 ? servings * scale : 1;
  const perServing: MacroTotals = {
    kcal: total.kcal / scaledServings,
    protein: total.protein / scaledServings,
    carbs: total.carbs / scaledServings,
    fat: total.fat / scaledServings,
    fiber: total.fiber / scaledServings,
    sugar: total.sugar / scaledServings,
    sodiumMg: total.sodiumMg / scaledServings,
  };

  return {
    total,
    perServing,
    contributions,
    // Coverage is 1 by convention when there is no determinable mass at all:
    // there is nothing to have missed. The interface distinguishes this from
    // genuine completeness using the counts below.
    coverage: determinableGrams > 0 ? resolvedGrams / determinableGrams : 1,
    resolvedGrams,
    determinableGrams,
    massUnknownCount,
    noQuantityCount,
  };
}

/**
 * Atwater factors: metabolisable energy per gram.
 *
 * These are the conventional values used on nutrition labels worldwide, derived
 * from bomb-calorimetry minus losses to incomplete digestion and urinary
 * excretion. They are approximations that vary by food, but they are the same
 * approximations every macro tracker uses, so matching them keeps this
 * application's figures commensurable with the tracker receiving them.
 */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

export interface EnergySplit {
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
  /** Percentages of the Atwater-derived energy total, summing to 100. */
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  /**
   * Energy implied by the macros, which may differ from the reported `kcal`:
   * databases round, and alcohol and polyols contribute energy no macro column
   * captures. Reported so the discrepancy is visible rather than hidden.
   */
  atwaterKcal: number;
}

/**
 * Splits a macro total into its energy contributions.
 *
 * The macro bar is energy-weighted rather than mass-weighted on purpose: fat is
 * slightly over twice as energy-dense as protein or carbohydrate, so a
 * mass-proportioned bar systematically understates its contribution to the
 * figure most people are reading the panel for.
 */
export function energySplit(totals: MacroTotals): EnergySplit {
  const proteinKcal = totals.protein * ATWATER.protein;
  const carbsKcal = totals.carbs * ATWATER.carbs;
  const fatKcal = totals.fat * ATWATER.fat;
  const atwaterKcal = proteinKcal + carbsKcal + fatKcal;

  if (atwaterKcal <= 0) {
    return {
      proteinKcal: 0,
      carbsKcal: 0,
      fatKcal: 0,
      proteinPct: 0,
      carbsPct: 0,
      fatPct: 0,
      atwaterKcal: 0,
    };
  }

  return {
    proteinKcal,
    carbsKcal,
    fatKcal,
    proteinPct: (proteinKcal / atwaterKcal) * 100,
    carbsPct: (carbsKcal / atwaterKcal) * 100,
    fatPct: (fatKcal / atwaterKcal) * 100,
    atwaterKcal,
  };
}

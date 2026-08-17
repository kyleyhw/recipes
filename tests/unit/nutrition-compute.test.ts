import { describe, expect, it } from "vitest";
import {
  ATWATER,
  computeNutrition,
  energySplit,
  type MacroVector,
  type NutritionInput,
} from "@/lib/nutrition/compute";
import {
  NUTRIENT_KEYS,
  nutrientVector,
  zeroTotals,
  type KnownNutrients,
  type NutrientTotals,
} from "@/lib/nutrition/nutrients";

/**
 * Tests for macro aggregation and coverage.
 *
 * The centrepiece is the scaling invariant, which is an exact algebraic
 * identity and therefore testable without any hand-computed expected value.
 * Tests that depend on hand-computed values test the author's arithmetic as
 * much as the code; this one cannot.
 */

function macro(overrides: KnownNutrients = {}): MacroVector {
  return nutrientVector({
    kcal: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    fiber: 2,
    sugar: 1,
    sodiumMg: 50,
    zincMg: 1,
    ...overrides,
  });
}

/** An aggregate with only the named fields set; everything else is zero. */
function totals(known: Partial<NutrientTotals>): NutrientTotals {
  return { ...zeroTotals(), ...known };
}

function input(overrides: Partial<NutritionInput> & { id: string }): NutritionInput {
  return {
    name: overrides.id,
    rawText: overrides.id,
    quantity: 100,
    unit: "g",
    optional: false,
    gramsOverride: null,
    macro: macro(),
    densityGPerMl: null,
    gramsPerUnit: null,
    ...overrides,
  };
}

describe("aggregation", () => {
  it("computes M = sum (g_i / 100) * m_i", () => {
    // 200 g at 100 kcal/100 g is 200 kcal; 50 g is 50 kcal.
    const result = computeNutrition(
      [
        input({ id: "a", quantity: 200, unit: "g" }),
        input({ id: "b", quantity: 50, unit: "g" }),
      ],
      1,
    );
    expect(result.total.kcal).toBeCloseTo(250, 10);
    expect(result.total.protein).toBeCloseTo(25, 10);
  });

  it("divides by the serving count", () => {
    const result = computeNutrition([input({ id: "a", quantity: 400, unit: "g" })], 4);
    expect(result.total.kcal).toBeCloseTo(400, 10);
    expect(result.perServing.kcal).toBeCloseTo(100, 10);
  });

  it("converts volume through the substance density", () => {
    // 1 cup = 240 ml; at rho = 0.5 that is 120 g, so 120 kcal.
    const result = computeNutrition(
      [input({ id: "a", quantity: 1, unit: "cup", densityGPerMl: 0.5 })],
      1,
    );
    expect(result.total.kcal).toBeCloseTo(120, 10);
  });

  it("honours a gram override above any inference", () => {
    const result = computeNutrition(
      [
        input({
          id: "a",
          quantity: 1,
          unit: "cup",
          densityGPerMl: 0.5,
          gramsOverride: 300,
        }),
      ],
      1,
    );
    expect(result.total.kcal).toBeCloseTo(300, 10);
  });

  it("excludes optional ingredients by default, and includes them on request", () => {
    const items = [
      input({ id: "base", quantity: 100, unit: "g" }),
      input({ id: "extra", quantity: 100, unit: "g", optional: true }),
    ];
    expect(computeNutrition(items, 1).total.kcal).toBeCloseTo(100, 10);
    expect(computeNutrition(items, 1, { includeOptional: true }).total.kcal).toBeCloseTo(
      200,
      10,
    );
  });
});

describe("the scaling invariant", () => {
  /**
   * Under scaling by alpha, g_i -> alpha*g_i and S -> alpha*S, so per-serving
   * macros are unchanged. This is exact, so any bug in the scaling or
   * aggregation path breaks it.
   *
   * alpha = 3.7 is deliberately non-dyadic and non-integer: dyadic factors can
   * mask errors that happen to land on representable values anyway.
   */
  const RECIPE: NutritionInput[] = [
    input({ id: "flour", quantity: 500, unit: "g" }),
    input({
      id: "milk",
      quantity: 1,
      unit: "cup",
      densityGPerMl: 1.03,
      macro: macro({ kcal: 60 }),
    }),
    input({
      id: "eggs",
      quantity: 2,
      unit: null,
      gramsPerUnit: 50,
      macro: macro({ kcal: 143 }),
    }),
  ];

  it.each([0.5, 1, 2, 3.7])(
    "leaves per-serving macros unchanged at alpha = %f",
    (alpha) => {
      const base = computeNutrition(RECIPE, 4);
      const scaled = computeNutrition(RECIPE, 4, { scale: alpha });

      expect(scaled.perServing.kcal).toBeCloseTo(base.perServing.kcal, 10);
      expect(scaled.perServing.protein).toBeCloseTo(base.perServing.protein, 10);
      expect(scaled.perServing.carbs).toBeCloseTo(base.perServing.carbs, 10);
      expect(scaled.perServing.fat).toBeCloseTo(base.perServing.fat, 10);
      expect(scaled.perServing.sodiumMg).toBeCloseTo(base.perServing.sodiumMg, 10);
    },
  );

  it("scales the totals linearly even though per-serving is invariant", () => {
    const base = computeNutrition(RECIPE, 4);
    const scaled = computeNutrition(RECIPE, 4, { scale: 3.7 });
    expect(scaled.total.kcal).toBeCloseTo(base.total.kcal * 3.7, 8);
  });

  it("holds when some ingredients are unresolved", () => {
    // The invariant must survive a partially-resolved recipe, which is the
    // realistic case.
    const partial = [
      ...RECIPE,
      input({ id: "mystery", quantity: 100, unit: "g", macro: null }),
    ];
    const base = computeNutrition(partial, 4);
    const scaled = computeNutrition(partial, 4, { scale: 2.3 });
    expect(scaled.perServing.kcal).toBeCloseTo(base.perServing.kcal, 10);
    expect(scaled.coverage).toBeCloseTo(base.coverage, 10);
  });
});

/**
 * Coverage, per nutrient.
 *
 * The overall figure answers "how much of this recipe has *any* nutrition
 * data?". Once the table is twenty columns wide that is no longer enough: the
 * library carries energy for every ingredient and magnesium for some of them,
 * so a recipe can be fully covered and still have a magnesium figure derived
 * from a third of its mass. These tests pin down the distinction.
 */
describe("per-nutrient coverage", () => {
  it("is the overall coverage for a nutrient every ingredient carries", () => {
    const result = computeNutrition([input({ id: "a" }), input({ id: "b" })], 2);
    expect(result.nutrientCoverage.kcal).toBe(result.coverage);
    expect(result.nutrientCoverage.kcal).toBe(1);
  });

  /**
   * The case the whole mechanism exists for: an ingredient resolves, so it
   * counts towards the overall coverage in full, but carries no figure for one
   * particular nutrient.
   */
  it("falls below the overall coverage where a resolved ingredient lacks a figure", () => {
    const result = computeNutrition(
      [
        // 300 g with a zinc figure, 100 g without.
        input({ id: "with", quantity: 300, macro: macro({ zincMg: 2 }) }),
        input({ id: "without", quantity: 100, macro: macro({ zincMg: null }) }),
      ],
      1,
    );
    expect(result.coverage).toBe(1);
    expect(result.nutrientCoverage.zincMg).toBeCloseTo(0.75, 10);
    // And the total is the lower bound it claims to be: only the 300 g counted.
    expect(result.total.zincMg).toBeCloseTo(6, 10);
  });

  /**
   * Zero coverage and a zero total are the two halves of "we do not know".
   * Without the first, the second is indistinguishable from an ingredient that
   * genuinely contains none of the nutrient.
   */
  it("reports zero coverage for a nutrient nothing carries", () => {
    const result = computeNutrition(
      [input({ id: "a", macro: macro({ folateUg: null }) })],
      1,
    );
    expect(result.nutrientCoverage.folateUg).toBe(0);
    expect(result.total.folateUg).toBe(0);
  });

  it("distinguishes an unknown from a stated zero", () => {
    const unknown = computeNutrition(
      [input({ id: "a", macro: macro({ folateUg: null }) })],
      1,
    );
    const stated = computeNutrition(
      [input({ id: "a", macro: macro({ folateUg: 0 }) })],
      1,
    );
    expect(unknown.total.folateUg).toBe(stated.total.folateUg);
    // The totals agree; the coverage is what tells them apart.
    expect(unknown.nutrientCoverage.folateUg).toBe(0);
    expect(stated.nutrientCoverage.folateUg).toBe(1);
  });

  /**
   * The scaling invariant is a statement about the
   * whole vector, not just about energy. It has to hold for a micronutrient
   * drawn from part of the recipe too.
   */
  it("holds the per-serving invariant across the whole table", () => {
    const rows = [
      input({ id: "a", quantity: 250, macro: macro({ zincMg: 3 }) }),
      input({ id: "b", quantity: 90, macro: macro({ zincMg: null }) }),
    ];
    const base = computeNutrition(rows, 4);
    for (const scale of [0.5, 2, 3.7]) {
      const scaled = computeNutrition(rows, 4, { scale });
      for (const key of NUTRIENT_KEYS) {
        expect(scaled.perServing[key]).toBeCloseTo(base.perServing[key], 10);
      }
      // Coverage is a ratio of masses, so it is invariant too.
      expect(scaled.nutrientCoverage.zincMg).toBeCloseTo(
        base.nutrientCoverage.zincMg,
        10,
      );
    }
  });

  it("reports full coverage for an empty recipe rather than NaN", () => {
    const result = computeNutrition([], 4);
    for (const key of NUTRIENT_KEYS) expect(result.nutrientCoverage[key]).toBe(1);
  });
});

describe("coverage", () => {
  /**
   * The reason coverage is mass-weighted. Counting would report 1 of 2 matched
   * in both cases below; the two situations are not remotely equivalent.
   */
  it("is mass-weighted, not count-weighted", () => {
    const heavyUnresolved = computeNutrition(
      [
        input({ id: "flour", quantity: 500, unit: "g", macro: null }),
        input({ id: "salt", quantity: 5, unit: "g" }),
      ],
      1,
    );
    const trivialUnresolved = computeNutrition(
      [
        input({ id: "flour", quantity: 500, unit: "g" }),
        input({ id: "salt", quantity: 5, unit: "g", macro: null }),
      ],
      1,
    );

    // Same count of unmatched ingredients; wildly different reliability.
    expect(heavyUnresolved.coverage).toBeCloseTo(5 / 505, 10);
    expect(trivialUnresolved.coverage).toBeCloseTo(500 / 505, 10);
  });

  it("is 1 when everything resolves", () => {
    const result = computeNutrition([input({ id: "a" }), input({ id: "b" })], 1);
    expect(result.coverage).toBe(1);
  });

  /**
   * An unresolved ingredient contributes nothing to the totals, but it is never
   * *presented* as nutritionally zero. The difference between "contains no fat"
   * and "we do not know its fat content" is the entire reason this metric
   * exists.
   */
  it("reports an unresolved ingredient as a gap rather than a zero", () => {
    const result = computeNutrition(
      [input({ id: "known" }), input({ id: "unknown", macro: null })],
      1,
    );
    const gap = result.contributions.find((c) => c.id === "unknown");
    expect(gap?.gap).toBe("unresolved");
    expect(gap?.macros).toBeNull();
    // Its mass is known, so it still counts against coverage.
    expect(gap?.grams).toBe(100);
    expect(result.coverage).toBeCloseTo(0.5, 10);
  });

  /**
   * The circularity in the denominator, resolved. An ingredient whose *mass*
   * cannot be determined cannot enter the coverage denominator without
   * inventing a figure, so it is reported separately.
   */
  it("separates undeterminable mass from unresolved nutrition", () => {
    const result = computeNutrition(
      [
        input({ id: "known", quantity: 100, unit: "g" }),
        // A volume with no density: the mass itself is unknown.
        input({ id: "oil", quantity: 1, unit: "cup", densityGPerMl: null }),
        // No quantity at all.
        input({ id: "salt", quantity: null, unit: null }),
      ],
      1,
    );

    expect(result.massUnknownCount).toBe(1);
    expect(result.noQuantityCount).toBe(1);
    // Coverage is over determinable mass only, so it stays at 1 — and the two
    // counts above are what stop that from being misread as completeness.
    expect(result.coverage).toBe(1);
    expect(result.determinableGrams).toBe(100);
  });

  it("treats an empty recipe as covered rather than dividing by zero", () => {
    const result = computeNutrition([], 4);
    expect(result.coverage).toBe(1);
    expect(result.total.kcal).toBe(0);
    expect(Number.isFinite(result.perServing.kcal)).toBe(true);
  });

  it("does not divide by zero on a non-positive serving count", () => {
    const result = computeNutrition([input({ id: "a" })], 0);
    expect(Number.isFinite(result.perServing.kcal)).toBe(true);
  });
});

describe("energy split", () => {
  it("uses the Atwater factors", () => {
    expect(ATWATER).toEqual({ protein: 4, carbs: 4, fat: 9 });
    const split = energySplit(totals({ protein: 10, carbs: 10, fat: 10 }));
    expect(split.proteinKcal).toBe(40);
    expect(split.carbsKcal).toBe(40);
    expect(split.fatKcal).toBe(90);
    expect(split.atwaterKcal).toBe(170);
  });

  /**
   * Equal masses of the three macronutrients do not contribute equal energy —
   * which is exactly why the bar is energy-weighted rather than mass-weighted.
   * A mass-proportioned bar would show three equal thirds here and understate
   * fat by a factor of more than two.
   */
  it("shows fat's disproportionate energy contribution", () => {
    const split = energySplit(totals({ protein: 10, carbs: 10, fat: 10 }));
    expect(split.fatPct).toBeCloseTo((90 / 170) * 100, 10);
    expect(split.fatPct).toBeGreaterThan(50);
  });

  it("produces percentages summing to 100", () => {
    const split = energySplit(
      totals({
        kcal: 500,
        protein: 30,
        carbs: 45,
        fat: 20,
        fiber: 5,
        sugar: 10,
        sodiumMg: 400,
      }),
    );
    expect(split.proteinPct + split.carbsPct + split.fatPct).toBeCloseTo(100, 10);
  });

  it("returns zeroes rather than NaN for an empty total", () => {
    const split = energySplit(totals({}));
    expect(split.proteinPct).toBe(0);
    expect(Number.isNaN(split.fatPct)).toBe(false);
  });
});

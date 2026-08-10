import { describe, expect, it } from "vitest";
import {
  ADVISORY_LOG_THRESHOLD,
  scaleRecipe,
  type ScalableIngredient,
} from "@/lib/scaling";

/**
 * Tests for portion scaling (docs/mathematics.md §2).
 */

function ingredient(
  overrides: Partial<ScalableIngredient> & { name: string },
): ScalableIngredient {
  return {
    id: overrides.name,
    rawText: overrides.rawText ?? overrides.name,
    quantity: 1,
    unit: null,
    prepNote: null,
    optional: false,
    scalable: true,
    ...overrides,
  };
}

/** A recipe exercising every code path: mass, volume, count, and unscalable. */
const FIXTURE: ScalableIngredient[] = [
  ingredient({ name: "flour", quantity: 500, unit: "g", rawText: "500 g flour" }),
  ingredient({ name: "milk", quantity: 1.5, unit: "cup", rawText: "1 1/2 cups milk" }),
  ingredient({ name: "eggs", quantity: 2, unit: null, rawText: "2 eggs" }),
  ingredient({
    name: "baking powder",
    quantity: 2,
    unit: "tsp",
    rawText: "2 tsp baking powder",
  }),
  ingredient({
    name: "salt",
    quantity: null,
    unit: null,
    scalable: false,
    rawText: "Salt to taste",
  }),
  ingredient({
    name: "vegetable oil",
    quantity: null,
    unit: null,
    scalable: false,
    rawText: "Vegetable oil, for frying",
  }),
];

describe("linear scaling", () => {
  it("multiplies scalable quantities by alpha", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 8);
    expect(scaled.factor).toBe(2);
    const flour = scaled.ingredients.find((i) => i.name === "flour");
    expect(flour?.scaledQuantity).toBe(1000);
    expect(flour?.rendered?.text).toBe("1 kg");
  });

  it("halves correctly", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 2);
    expect(scaled.factor).toBe(0.5);
    const milk = scaled.ingredients.find((i) => i.name === "milk");
    expect(milk?.scaledQuantity).toBe(0.75);
    expect(milk?.rendered?.text).toBe("¾ cup");
  });

  /**
   * The passthrough rule. Multiplying "salt to taste" by three produces
   * confident nonsense, and "oil for frying" describes a method rather than an
   * amount.
   */
  it("passes unscalable lines through untouched", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 12);
    const salt = scaled.ingredients.find((i) => i.name === "salt");
    const oil = scaled.ingredients.find((i) => i.name === "vegetable oil");
    expect(salt?.passedThrough).toBe(true);
    expect(salt?.display).toBe("Salt to taste");
    expect(oil?.display).toBe("Vegetable oil, for frying");
  });

  it("is an identity at alpha = 1", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 4);
    expect(scaled.factor).toBe(1);
    for (const item of scaled.ingredients) {
      if (item.passedThrough) continue;
      const original = FIXTURE.find((i) => i.name === item.name);
      expect(item.scaledQuantity).toBe(original?.quantity);
    }
  });

  /**
   * Scaling is a *view*: the stored recipe keeps its base servings, so scaling
   * up and back must return exactly where it started.
   */
  it("round-trips: scaling up then back is the identity", () => {
    const up = scaleRecipe(FIXTURE, 4, 10);
    const back = scaleRecipe(
      up.ingredients.map((i) => ({ ...i, quantity: i.scaledQuantity })),
      10,
      4,
    );
    for (const item of back.ingredients) {
      if (item.passedThrough) continue;
      const original = FIXTURE.find((i) => i.name === item.name);
      expect(item.scaledQuantity!).toBeCloseTo(original!.quantity!, 10);
    }
  });

  it("guards against a non-positive base or target", () => {
    // alpha = target/base would be undefined or negative, which would silently
    // produce negative quantities rather than failing.
    expect(scaleRecipe(FIXTURE, 0, 4).factor).toBeGreaterThan(0);
    expect(scaleRecipe(FIXTURE, 4, 0).factor).toBe(1);
    expect(scaleRecipe(FIXTURE, 4, -2).factor).toBe(1);
  });
});

describe("non-linearity advisories", () => {
  /**
   * The threshold is on |ln alpha| because scaling is multiplicative: halving
   * and doubling are equally large departures from alpha = 1, and the logarithm
   * treats them so, while |alpha - 1| would call doubling twice the change that
   * halving is.
   */
  it("treats halving and doubling as equally large departures", () => {
    const doubled = scaleRecipe(FIXTURE, 4, 8);
    const halved = scaleRecipe(FIXTURE, 4, 2);
    const leavenerIn = (r: typeof doubled) =>
      r.ingredients.find((i) => i.name === "baking powder")?.advisory;
    expect(leavenerIn(doubled)).not.toBeNull();
    expect(leavenerIn(halved)).not.toBeNull();
    expect(Math.abs(Math.log(2))).toBeCloseTo(Math.abs(Math.log(0.5)), 12);
  });

  it("stays silent inside the threshold", () => {
    // 4 -> 5 servings is a 1.25x factor: |ln 1.25| = 0.223 < ln(1.5) = 0.405.
    const scaled = scaleRecipe(FIXTURE, 4, 5);
    expect(Math.abs(Math.log(1.25))).toBeLessThan(ADVISORY_LOG_THRESHOLD);
    expect(scaled.ingredients.every((i) => i.advisory === null)).toBe(true);
    expect(scaled.advisories.filter((a) => a.kind !== "eggs")).toHaveLength(0);
  });

  it("flags chemical leavening past the threshold", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 12);
    const leavener = scaled.ingredients.find((i) => i.name === "baking powder");
    expect(leavener?.advisory).toContain("does not scale linearly");
    // The quantity is still scaled — the application flags rather than silently
    // correcting, because a plausible correction factor would be fabricated
    // precision that the cook would then trust.
    expect(leavener?.scaledQuantity).toBe(6);
  });

  it("does not flag ordinary ingredients", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 12);
    expect(scaled.ingredients.find((i) => i.name === "flour")?.advisory).toBeNull();
    expect(scaled.ingredients.find((i) => i.name === "milk")?.advisory).toBeNull();
  });

  it("advises on pan size and cooking time when scaling substantially", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 12, { cookMinutes: 40 });
    const kinds = scaled.advisories.map((a) => a.kind);
    expect(kinds).toContain("vessel");
    expect(kinds).toContain("bake-time");
  });

  it("omits the cooking-time advisory when the recipe states no cooking time", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 12);
    expect(scaled.advisories.map((a) => a.kind)).not.toContain("bake-time");
  });
});

describe("egg advisory", () => {
  /**
   * Eggs land between whole numbers constantly, and "2.5 eggs" is a genuinely
   * unhelpful instruction. Beating one extra and using a measured fraction is
   * the standard kitchen technique, and is more accurate than rounding a
   * four-egg custard to five.
   */
  it("explains what to do with a fractional egg count", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 5); // 2 eggs -> 2.5
    const advisory = scaled.advisories.find((a) => a.kind === "eggs");
    expect(advisory?.text).toContain("2.5 eggs");
    expect(advisory?.text).toContain("beat 3 eggs");
  });

  it("stays silent when the egg count lands whole", () => {
    for (const target of [2, 4, 6, 8]) {
      const scaled = scaleRecipe(FIXTURE, 4, target);
      expect(scaled.advisories.find((a) => a.kind === "eggs")).toBeUndefined();
    }
  });
});

describe("rendering integration", () => {
  it("keeps each ingredient in its own measurement system", () => {
    const scaled = scaleRecipe(FIXTURE, 4, 8);
    expect(scaled.ingredients.find((i) => i.name === "flour")?.rendered?.unit).toMatch(
      /^(g|kg)$/,
    );
    expect(scaled.ingredients.find((i) => i.name === "milk")?.rendered?.unit).toMatch(
      /cup|tbsp|tsp/,
    );
  });

  it("appends the preparation note after the quantity", () => {
    const scaled = scaleRecipe(
      [ingredient({ name: "onion", quantity: 1, unit: null, prepNote: "finely diced" })],
      4,
      8,
    );
    expect(scaled.ingredients[0]?.display).toBe("2 onion, finely diced");
  });
});

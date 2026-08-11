import { describe, expect, it } from "vitest";
import {
  describeTin,
  scaleTin,
  STANDARD_ROUND,
  tinAdviceText,
  tinArea,
  type Tin,
} from "@/lib/tin";

/**
 * Tests for scaling a baking tin.
 *
 * The intuition this feature exists to correct is that twice the batter wants
 * twice the tin. It does not: holding the *depth* constant — which is what the
 * bake time was chosen for — means the base area doubles and every linear
 * dimension grows by only sqrt(2). Several tests below pin that factor
 * explicitly, because getting it wrong produces confident, plausible, wrong
 * instructions.
 */

const ROUND_20: Tin = { shape: "round", diameter: 20, depth: 4 };

describe("area", () => {
  it("computes a round tin's area from its diameter", () => {
    expect(tinArea(ROUND_20)).toBeCloseTo(Math.PI * 100, 10);
  });

  it("computes square and rectangular areas", () => {
    expect(tinArea({ shape: "square", length: 20 })).toBe(400);
    expect(tinArea({ shape: "loaf", length: 23, width: 13 })).toBe(299);
  });

  /**
   * A tin missing the dimension its shape needs cannot be scaled, and inventing
   * the missing number would produce an instruction resting on nothing.
   */
  it.each([
    ["a round tin with no diameter", { shape: "round" } as Tin],
    ["a square tin with no side", { shape: "square" } as Tin],
    ["a loaf tin with only a length", { shape: "loaf", length: 23 } as Tin],
    ["a zero diameter", { shape: "round", diameter: 0 } as Tin],
  ])("returns null for %s", (_label, tin) => {
    expect(tinArea(tin)).toBeNull();
  });
});

describe("the square-root rule", () => {
  /**
   * The heart of it. Doubling the recipe wants a tin sqrt(2) = 1.414 times
   * wider — 28.3 cm from 20 cm — not 40 cm.
   */
  it("scales a round tin's diameter by sqrt(alpha)", () => {
    const advice = scaleTin(ROUND_20, 2);
    expect(advice?.ideal.diameter).toBeCloseTo(20 * Math.SQRT2, 10);
    expect(advice?.ideal.diameter).toBeCloseTo(28.284, 3);
  });

  it("scales a square tin's side by sqrt(alpha)", () => {
    const advice = scaleTin({ shape: "square", length: 20 }, 2);
    expect(advice?.ideal.length).toBeCloseTo(20 * Math.SQRT2, 10);
  });

  it("scales both sides of a rectangular tin, preserving its proportions", () => {
    const advice = scaleTin({ shape: "rectangular", length: 30, width: 20 }, 4);
    const ideal = advice?.ideal;
    expect(ideal?.length).toBeCloseTo(60, 10);
    expect(ideal?.width).toBeCloseTo(40, 10);
    // Doubling each side quadruples the area, which is the alpha asked for.
    expect((ideal?.length ?? 0) / (ideal?.width ?? 1)).toBeCloseTo(1.5, 10);
  });

  /**
   * The property that makes the rule right, asserted without a hand-computed
   * value: the ideal tin's area is exactly alpha times the original's, for any
   * alpha. That is the definition of holding the depth constant.
   */
  it.each([0.5, 1.5, 2, 3, 7.3])(
    "gives the ideal tin exactly alpha times the area (alpha = %f)",
    (alpha) => {
      const advice = scaleTin(ROUND_20, alpha);
      expect(tinArea(advice!.ideal)!).toBeCloseTo(tinArea(ROUND_20)! * alpha, 8);
    },
  );

  it("halves correctly too", () => {
    const advice = scaleTin(ROUND_20, 0.5);
    expect(advice?.ideal.diameter).toBeCloseTo(20 / Math.SQRT2, 10);
  });

  it("returns null for a non-positive or non-finite scale", () => {
    expect(scaleTin(ROUND_20, 0)).toBeNull();
    expect(scaleTin(ROUND_20, -1)).toBeNull();
    expect(scaleTin(ROUND_20, Number.NaN)).toBeNull();
  });
});

describe("snapping to a tin someone owns", () => {
  /**
   * "Use a 28.3 cm tin" is not an instruction anybody can follow. The nearest
   * real tin, plus what it does to the depth, is.
   */
  it("chooses the nearest standard round tin", () => {
    const advice = scaleTin(ROUND_20, 2);
    expect(advice?.nearest?.diameter).toBe(28);
    expect(STANDARD_ROUND).toContain(advice?.nearest?.diameter);
  });

  /**
   * 28 cm is slightly *larger* than the ideal 28.28 cm... in area terms it is
   * slightly smaller, so the batter sits marginally deeper. The factor must
   * reflect that rather than being assumed to be 1.
   */
  it("reports how deep the batter sits in the chosen tin", () => {
    const advice = scaleTin(ROUND_20, 2);
    const idealArea = tinArea(ROUND_20)! * 2;
    const chosenArea = tinArea(advice!.nearest!)!;
    expect(advice?.depthFactor).toBeCloseTo(idealArea / chosenArea, 10);
    expect(advice?.depthFactor).toBeGreaterThan(1);
  });

  it("converts the depth factor into centimetres when the tin states a depth", () => {
    const advice = scaleTin(ROUND_20, 2);
    expect(advice?.depthCm).toBeCloseTo(4 * advice!.depthFactor!, 1);
  });

  it("reports no depth in centimetres when the original tin did not state one", () => {
    expect(scaleTin({ shape: "round", diameter: 20 }, 2)?.depthCm).toBeNull();
  });

  it("chooses a loaf tin by area, which is how a cook steps up a size", () => {
    // A 19x9 loaf doubled wants 342 cm^2; the 23x13 (299) is nearer than the
    // 26x14 (364)... in fact 364 is nearer, and that is the right answer.
    const advice = scaleTin({ shape: "loaf", length: 19, width: 9 }, 2);
    expect(advice?.nearest?.length).toBe(26);
    expect(advice?.nearest?.width).toBe(14);
  });
});

describe("the sentence a cook reads", () => {
  it("says nothing when the recipe is not scaled", () => {
    expect(tinAdviceText(ROUND_20, 1)).toBeNull();
  });

  it("names the ideal tin and the real one", () => {
    const text = tinAdviceText(ROUND_20, 2) ?? "";
    expect(text).toContain("28.3 cm round tin");
    expect(text).toContain("28 cm round tin");
  });

  /**
   * When the nearest tin is close enough, saying "the time and temperature
   * stand" is more useful than a percentage nobody needs to act on.
   */
  it("says the bake is unaffected when the depth barely changes", () => {
    const text = tinAdviceText(ROUND_20, 2) ?? "";
    expect(text).toMatch(/close enough|time and temperature stand/);
  });

  /**
   * The standard sizes are dense enough that snapping usually lands inside the
   * tolerance — which is itself a useful finding. The case that genuinely
   * bites is running *out* of tin, and the right answer there is not "bake it
   * deeper for longer" (a layer 78% deeper burns at the edge before the middle
   * sets) but "bake it in two".
   */
  it("says to divide between tins when the recipe outgrows the largest one", () => {
    const text = tinAdviceText(ROUND_20, 4) ?? "";
    expect(text).toContain("40 cm round tin");
    expect(text).toMatch(/divide the batter between 2/);
    expect(text).toMatch(/larger than any standard tin/);
  });

  /**
   * The other case: an ideal size landing in the widest gap in the standard
   * range, between 15 and 18 cm. alpha = 0.67 on a 20 cm tin wants 16.4 cm; the
   * nearest is 15, which makes the layer 19% deeper. A warning that did not say
   * "cooler and longer" would leave the cook exactly where they started.
   */
  it("tells the cook which way to adjust when the depth changes materially", () => {
    const text = tinAdviceText({ shape: "round", diameter: 20, depth: 4 }, 0.67) ?? "";
    expect(text).toMatch(/deeper|shallower/);
    expect(text).toMatch(/lower temperature|less time/);
  });

  it("says nothing at all for a tin it cannot scale", () => {
    expect(tinAdviceText({ shape: "round" }, 2)).toBeNull();
  });
});

describe("describing a tin", () => {
  it.each([
    [{ shape: "round", diameter: 20 } as Tin, "20 cm round tin"],
    [{ shape: "square", length: 23 } as Tin, "23 cm square tin"],
    [{ shape: "loaf", length: 23, width: 13 } as Tin, "23 × 13 cm loaf tin"],
  ])("describes %j", (tin, expected) => {
    expect(describeTin(tin)).toBe(expected);
  });

  it("rounds to one decimal, because a tin is not measured to microns", () => {
    expect(describeTin({ shape: "round", diameter: 28.2842712 })).toBe(
      "28.3 cm round tin",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  ALCOHOL_LABEL_G,
  amountsPerServing,
  CAFFEINE_LABEL_MG,
  labelsFor,
  type ContainsLine,
} from "@/lib/contains";

/**
 * Tests for how much alcohol and caffeine a serving carries.
 *
 * The failure this module exists to prevent is a label that fires on
 * everything. "Contains alcohol" on a chocolate chip cookie, from half a
 * teaspoon of vanilla extract shared between twenty-four of them, is not a
 * harmless over-warning: it is what teaches a reader to ignore the same label
 * on a jug of sangria. So the two cases pinned hardest below are the real
 * quantities from the two real recipes, at either end of the threshold.
 */

/** Red wine as the library holds it: 13% ABV, rho 0.99. */
const wine = (grams: number): ContainsLine => ({
  grams,
  densityGPerMl: 0.99,
  abvPercent: 13,
  caffeineMg100g: null,
});

/** Brandy: 40% ABV, rho 0.94. */
const brandy = (grams: number): ContainsLine => ({
  grams,
  densityGPerMl: 0.94,
  abvPercent: 40,
  caffeineMg100g: null,
});

/** Vanilla extract: 35% ABV, rho 0.87. */
const vanilla = (grams: number): ContainsLine => ({
  grams,
  densityGPerMl: 0.87,
  abvPercent: 35,
  caffeineMg100g: null,
});

const NOTHING: ContainsLine = {
  grams: 500,
  densityGPerMl: 1,
  abvPercent: null,
  caffeineMg100g: null,
};

describe("the arithmetic", () => {
  it("converts a mass back through density to get an ethanol mass", () => {
    // 99 g of wine is 100 ml; 13 ml of that is ethanol; at 0.789 g/ml that is
    // 10.26 g, and over one serving it stays 10.26 g.
    expect(amountsPerServing([wine(99)], 1).ethanolG).toBeCloseTo(10.257, 3);
  });

  it("divides by the serving count, because nobody drinks the jug", () => {
    const one = amountsPerServing([wine(99)], 1).ethanolG;
    expect(amountsPerServing([wine(99)], 6).ethanolG).toBeCloseTo(one / 6, 6);
  });

  it("adds every line that carries alcohol", () => {
    const both = amountsPerServing([wine(99), brandy(94)], 1).ethanolG;
    const apart =
      amountsPerServing([wine(99)], 1).ethanolG +
      amountsPerServing([brandy(94)], 1).ethanolG;
    expect(both).toBeCloseTo(apart, 9);
  });

  it("takes caffeine straight off the mass, with no density involved", () => {
    // Black tea at 20 mg per 100 g: 400 g of it is 80 mg, halved to 40 a glass.
    const tea: ContainsLine = {
      grams: 400,
      densityGPerMl: 1,
      abvPercent: null,
      caffeineMg100g: 20,
    };
    expect(amountsPerServing([tea], 2).caffeineMg).toBeCloseTo(40, 6);
  });
});

describe("what it refuses to guess", () => {
  it("counts nothing from a line whose mass is unknown", () => {
    const noMass: ContainsLine = { ...wine(0), grams: null };
    expect(amountsPerServing([noMass], 1).ethanolG).toBe(0);
  });

  it("counts no alcohol from a line with no density to convert through", () => {
    // Understating is the safe direction for a figure only ever compared
    // against a threshold, and every alcoholic row in the library has rho.
    const noRho: ContainsLine = { ...wine(500), densityGPerMl: null };
    expect(amountsPerServing([noRho], 1).ethanolG).toBe(0);
  });

  it("returns nothing rather than dividing by a serving count of zero", () => {
    expect(amountsPerServing([wine(750)], 0)).toEqual({ ethanolG: 0, caffeineMg: 0 });
  });

  it("is zero for a recipe with neither", () => {
    expect(amountsPerServing([NOTHING, NOTHING], 4)).toEqual({
      ethanolG: 0,
      caffeineMg: 0,
    });
  });
});

describe("the threshold, at the two quantities that matter", () => {
  it("labels a glass of sangria", () => {
    // 750 ml of wine and 60 ml of brandy, over six glasses.
    const lines = [wine(750 * 0.99), brandy(60 * 0.94)];
    const { ethanolG } = amountsPerServing(lines, 6);
    expect(ethanolG).toBeGreaterThan(ALCOHOL_LABEL_G);
    // Two UK units a glass, a unit being 8 g.
    expect(ethanolG / 8).toBeCloseTo(2, 0);
    expect(labelsFor(lines, 6).alcohol).toBe(true);
  });

  it("does not label a cookie for its half teaspoon of vanilla extract", () => {
    // 2.5 ml of extract across twenty-four cookies.
    const lines = [vanilla(2.5 * 0.87)];
    expect(amountsPerServing(lines, 24).ethanolG).toBeLessThan(ALCOHOL_LABEL_G);
    expect(labelsFor(lines, 24).alcohol).toBe(false);
  });

  it("labels a dish braised in wine, cooking notwithstanding", () => {
    // The white wine pasta: 180 ml of wine over four. It is boiled down, and
    // the label still fires, deliberately — see the note in the module about
    // what is not modelled. An earlier draft of that note claimed cases like
    // this were always too small to reach the threshold; they are not, and
    // this test is here so nobody restores the claim.
    const white: ContainsLine = {
      grams: 180 * 0.99,
      densityGPerMl: 0.99,
      abvPercent: 12,
      caffeineMg100g: null,
    };
    expect(amountsPerServing([white], 4).ethanolG).toBeGreaterThan(ALCOHOL_LABEL_G);
  });

  it("does not label a stir-fry for a tablespoon of shaoxing", () => {
    const shaoxing: ContainsLine = {
      grams: 15 * 0.99,
      densityGPerMl: 0.99,
      abvPercent: 15,
      caffeineMg100g: null,
    };
    // Under the threshold on volume alone. Not every cooked case is — see the
    // wine braise above — but this one is, and a splash of cooking wine is the
    // quantity the threshold most needs to keep out.
    expect(amountsPerServing([shaoxing], 4).ethanolG).toBeLessThan(ALCOHOL_LABEL_G);
  });

  it("labels a strong cup of tea and not a dusting of cocoa", () => {
    const tea: ContainsLine = {
      grams: 200,
      densityGPerMl: 1,
      abvPercent: null,
      caffeineMg100g: 20,
    };
    const dusting: ContainsLine = {
      grams: 2,
      densityGPerMl: 0.4,
      abvPercent: null,
      caffeineMg100g: 230,
    };
    expect(amountsPerServing([tea], 1).caffeineMg).toBeGreaterThan(CAFFEINE_LABEL_MG);
    expect(labelsFor([dusting], 4).caffeine).toBe(false);
  });

  it("labels at the threshold and not just above it", () => {
    const lines = [{ ...NOTHING, grams: 100, caffeineMg100g: CAFFEINE_LABEL_MG }];
    expect(labelsFor(lines, 1).caffeine).toBe(true);
  });
});

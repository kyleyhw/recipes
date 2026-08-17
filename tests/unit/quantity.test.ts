import { describe, expect, it } from "vitest";
import {
  FRACTION_TOLERANCE,
  bestFraction,
  formatFraction,
  renderMagnitude,
  renderQuantity,
} from "@/lib/quantity";

/**
 * Tests for quantity rendering.
 *
 * The defining property is the *constraint*: every fraction this module emits
 * must have a denominator in D = {1,2,3,4,6,8}, because those are the
 * denominators kitchen equipment realises. An unconstrained best-rational
 * approximation would produce closer answers that no cook can measure.
 */

const ALLOWED_DENOMINATORS = new Set([1, 2, 3, 4, 6, 8]);

describe("constrained rational approximation", () => {
  it.each([
    [0.5, "½"],
    [0.25, "¼"],
    [0.75, "¾"],
    [1 / 3, "⅓"],
    [2 / 3, "⅔"],
    [0.125, "⅛"],
    [0.875, "⅞"],
    [1.5, "1½"],
    [3.75, "3¾"],
    [2, "2"],
  ])("renders %f as %s", (value, expected) => {
    const fraction = bestFraction(value);
    expect(fraction).not.toBeNull();
    expect(formatFraction(fraction!)).toBe(expected);
  });

  it("snaps 0.333 to a third rather than to a decimal", () => {
    const fraction = bestFraction(0.333);
    expect(formatFraction(fraction!)).toBe("⅓");
    expect(fraction!.relativeError).toBeLessThan(FRACTION_TOLERANCE);
  });

  /**
   * The case the maths doc names explicitly. The unconstrained best rational
   * approximation to 0.5385 is 7/13, which is closer than anything in D but
   * useless: no measuring spoon realises thirteenths. The constrained search
   * must return a member of D instead.
   */
  it("does not emit 7/13 for 0.5385, the continued-fraction answer", () => {
    const fraction = bestFraction(0.5385);
    expect(fraction!.denominator).not.toBe(13);
    expect(ALLOWED_DENOMINATORS.has(fraction!.denominator)).toBe(true);
    // 4/8 reduces to 1/2, which is the nearest realisable value.
    expect(formatFraction(fraction!)).toBe("½");
  });

  it("never emits a denominator outside D, over a dense sweep", () => {
    // 0.0625 to 10 in hundredths, covering every fractional remainder a scaled
    // quantity can land on. The sweep starts at 1/16 because below that every
    // candidate numerator rounds to zero and the correct answer is null — no
    // fraction in D describes 0.01 of anything.
    for (let i = 7; i <= 1000; i += 1) {
      const fraction = bestFraction(i / 100);
      expect(fraction).not.toBeNull();
      expect(ALLOWED_DENOMINATORS.has(fraction!.denominator)).toBe(true);
    }
  });

  it("returns null below 1/16, where no member of D applies", () => {
    expect(bestFraction(0.01)).toBeNull();
    expect(bestFraction(0.05)).toBeNull();
    expect(bestFraction(0.0625)).not.toBeNull();
  });

  it("breaks ties toward the smaller denominator", () => {
    // 0.5 is exactly representable as 1/2, 2/4, 3/6 and 4/8; a cook wants ½.
    expect(bestFraction(0.5)!.denominator).toBe(2);
    expect(bestFraction(0.25)!.denominator).toBe(4);
  });

  it("reports honest relative error", () => {
    // 0.9375 = 15/16 is outside D. The nearest member is 1 (error 6.7%), which
    // exceeds the 5% tolerance, so callers must fall back to a decimal rather
    // than silently mis-rounding a measurement by a sixteenth.
    const fraction = bestFraction(0.9375);
    expect(ALLOWED_DENOMINATORS.has(fraction!.denominator)).toBe(true);
    expect(fraction!.relativeError).toBeGreaterThan(FRACTION_TOLERANCE);
  });

  it("returns null for non-positive or non-finite input", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(bestFraction(value)).toBeNull();
    }
  });
});

describe("unit selection", () => {
  /**
   * 887 ml is 3.696 cups. The nearest member of D is 3⅔ (0.79% error), which
   * beats 3¾ (1.46%). An earlier draft of the maths doc claimed 3¾ here; the
   * arithmetic says otherwise and the code is right.
   */
  it("renders 887 ml as 3⅔ cups in the imperial idiom", () => {
    const rendered = renderMagnitude(887, "volume", "imperial");
    expect(rendered.text).toBe("3⅔ cups");
    expect(rendered.exact).toBe(true);
  });

  it("renders the obvious cases obviously", () => {
    expect(renderMagnitude(240, "volume", "imperial").text).toBe("1 cup");
    expect(renderMagnitude(15, "volume", "imperial").text).toBe("1 tbsp");
    expect(renderMagnitude(5, "volume", "imperial").text).toBe("1 tsp");
    expect(renderMagnitude(1000, "mass", "metric").text).toBe("1 kg");
  });

  /**
   * The comfortable-range rule. 180 ml is ¾ cup, 12 tbsp, 36 tsp, or 6⅛ fl oz —
   * all correct, and only one is what a cook wants to read. Twelve scoops is
   * not a measurement.
   */
  it("prefers one measure over many scoops", () => {
    // 180 ml is ¾ cup, 12 tbsp or 36 tsp. Only the cup is in comfortable range;
    // twelve scoops is not a measurement.
    expect(renderMagnitude(180, "volume", "imperial").text).toBe("¾ cup");
  });

  it("prefers a whole number in a smaller unit over a fraction in a larger one", () => {
    // 5 ml is ⅓ tbsp or 1 tsp. The tablespoon is larger; the teaspoon is what a
    // cook can actually measure in one go.
    expect(renderMagnitude(5, "volume", "imperial").text).toBe("1 tsp");
    // 60 ml is ¼ cup or 4 tbsp; the whole number wins.
    expect(renderMagnitude(60, "volume", "imperial").text).toBe("4 tbsp");
  });

  it("breaks denominator ties toward the larger unit", () => {
    // 15 ml is 1 tbsp or 3 tsp — both whole. One scoop beats three.
    expect(renderMagnitude(15, "volume", "imperial").text).toBe("1 tbsp");
  });

  it("uses the tsp/tbsp/cup ladder rather than fluid ounces", () => {
    // fl oz is the larger unit for 15 ml, but "½ fl oz" is not what a cook
    // wants to read and not what they own a measure for. fl oz is accepted as
    // input and never chosen as output.
    expect(renderMagnitude(15, "volume", "imperial").text).toBe("1 tbsp");
    expect(renderMagnitude(30, "volume", "imperial").text).toBe("2 tbsp");
  });

  it("uses the singular at or below one, as recipes are written", () => {
    expect(renderMagnitude(180, "volume", "imperial").text).toBe("¾ cup");
    expect(renderMagnitude(240, "volume", "imperial").text).toBe("1 cup");
    expect(renderMagnitude(360, "volume", "imperial").text).toBe("1½ cups");
  });

  /**
   * Metric never uses fractions. "⅔ kg" is not something anyone writes —
   * metric measurement exists precisely to avoid fractions.
   */
  it("renders metric as decimals, never fractions", () => {
    for (const magnitude of [3.7, 887, 250, 1500]) {
      const rendered = renderMagnitude(magnitude, "volume", "metric");
      expect(rendered.text).toMatch(/^\d+(\.\d)? (ml|l)$/);
      expect(rendered.exact).toBe(false);
    }
  });

  it("drops the decimal place above 10, where it is noise", () => {
    // 2.5 g of yeast is meaningful; 487.3 g of flour is not.
    expect(renderMagnitude(2.53, "mass", "metric").text).toBe("2.5 g");
    expect(renderMagnitude(487.3, "mass", "metric").text).toBe("487 g");
  });

  it("inflects unit labels", () => {
    expect(renderMagnitude(240, "volume", "imperial").unit).toBe("cup");
    expect(renderMagnitude(480, "volume", "imperial").unit).toBe("cups");
  });

  it("handles zero and negative magnitudes without throwing", () => {
    expect(renderMagnitude(0, "volume", "imperial").text).toBe("0");
    expect(renderMagnitude(-5, "mass", "metric").text).toBe("0");
  });
});

describe("renderQuantity", () => {
  it("never crosses measurement systems", () => {
    // 500 g is 1.1 lb. Rendering it as "1⅛ lb" would be arithmetically right
    // and still wrong: the cook is following a metric recipe with a metric
    // scale out. Likewise a cup recipe must not come back in millilitres.
    expect(renderQuantity(500, "g").unit).toBe("g");
    expect(renderQuantity(2, "cup").unit).toMatch(/cup/);
    expect(renderQuantity(1, "lb").unit).toBe("lb");
    expect(renderQuantity(250, "ml").unit).toBe("ml");
  });

  it("renders a bare count with no unit label", () => {
    const rendered = renderQuantity(3, null);
    expect(rendered.text).toBe("3");
    expect(rendered.unit).toBe("");
  });

  it("renders fractional counts as fractions", () => {
    expect(renderQuantity(2.5, null).text).toBe("2½");
  });

  it("renders count units in place, with inflection", () => {
    expect(renderQuantity(1, "clove").text).toBe("1 clove");
    expect(renderQuantity(3, "clove").text).toBe("3 cloves");
  });

  it("scales cleanly through the halving and doubling a cook actually does", () => {
    // 1½ cups halved is ¾ cup; doubled is 3 cups. Both must stay exact.
    expect(renderQuantity(1.5 * 0.5, "cup").text).toBe("¾ cup");
    expect(renderQuantity(1.5 * 2, "cup").text).toBe("3 cups");
  });
});

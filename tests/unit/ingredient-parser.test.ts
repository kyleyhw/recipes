import { describe, expect, it } from "vitest";
import { parseIngredientBlock, parseIngredientLine } from "@/lib/ingredient-parser";

/**
 * Tests for the free-text ingredient parser.
 *
 * Inputs are drawn from the notations that actually occur in recipes rather
 * than from synthetic strings: mixed numbers and vulgar fractions dominate
 * baking, ranges dominate seasoning, and "to taste" / "for frying" are the
 * lines that must never be scaled.
 */

describe("quantity notations", () => {
  it.each([
    ["2 eggs", 2],
    ["2.5 cups flour", 2.5],
    ["3/4 cup sugar", 0.75],
    ["1 1/2 cups milk", 1.5],
    ["½ tsp salt", 0.5],
    ["1½ cups water", 1.5],
    ["⅔ cup cream", 2 / 3],
  ])("parses %s as %f", (line, expected) => {
    expect(parseIngredientLine(line).quantity).toBeCloseTo(expected, 10);
  });

  /**
   * Ranges take the midpoint. The value feeds macro computation, where the
   * midpoint is the better estimator than either endpoint; the original range
   * remains visible in rawText, which is never discarded.
   */
  it.each([
    ["2-3 cloves garlic", 2.5],
    ["2 to 3 tbsp oil", 2.5],
    ["4–6 potatoes", 5],
  ])("takes the midpoint of the range in %s", (line, expected) => {
    expect(parseIngredientLine(line).quantity).toBe(expected);
  });

  it("returns null rather than 0 when no quantity is stated", () => {
    // 0 would be a quantity, and would silently contribute nothing to macros
    // while looking like a real measurement. null is the honest value.
    expect(parseIngredientLine("Salt and pepper").quantity).toBeNull();
  });

  it("does not divide by zero on a malformed fraction", () => {
    const result = parseIngredientLine("1/0 cup flour");
    expect(Number.isFinite(result.quantity ?? 0)).toBe(true);
  });
});

describe("units", () => {
  it.each([
    ["2 cups flour", "cup"],
    ["1 tbsp olive oil", "tbsp"],
    ["3 tsp vanilla", "tsp"],
    ["500 g flour", "g"],
    ["1 kg potatoes", "kg"],
    ["8 oz cream cheese", "oz"],
    ["2 lbs beef", "lb"],
    ["250 ml milk", "ml"],
    ["1 fl oz vanilla", "floz"],
  ])("normalises the unit in %s to %s", (line, expected) => {
    expect(parseIngredientLine(line).unit).toBe(expected);
  });

  it("treats an unrecognised word as part of the name, not a unit", () => {
    const result = parseIngredientLine("2 large onions");
    expect(result.unit).toBeNull();
    expect(result.name).toBe("large onions");
  });

  /**
   * A unit token with no preceding quantity is far more likely to be an
   * ingredient name. Parsing "cups" as a unit here would leave an empty name.
   */
  it("does not read a unit when no quantity precedes it", () => {
    const result = parseIngredientLine("cups and saucers");
    expect(result.unit).toBeNull();
    expect(result.name).toBe("cups and saucers");
  });
});

describe("name and preparation note", () => {
  it("splits on the first comma", () => {
    const result = parseIngredientLine("1 large onion, finely diced");
    expect(result.name).toBe("large onion");
    expect(result.prepNote).toBe("finely diced");
  });

  it("treats trailing parenthesised text as a note", () => {
    const result = parseIngredientLine("200 g butter (at room temperature)");
    expect(result.name).toBe("butter");
    expect(result.prepNote).toBe("at room temperature");
  });

  it("leaves prepNote null when there is no separator", () => {
    expect(parseIngredientLine("500 g flour").prepNote).toBeNull();
  });

  it("never produces an empty name from non-blank input", () => {
    // An unnamed row is unusable in the interface; a noisy one is merely ugly.
    // "-" is the sharp case: the list-marker strip consumes the entire line, so
    // the fallback has to reach past it to the trimmed original.
    for (const line of [",", "2", "1 cup", "-", "• "]) {
      expect(parseIngredientLine(line).name.length).toBeGreaterThan(0);
    }
  });
});

describe("scalability", () => {
  /**
   * These are the lines where naive multiplication produces confident
   * nonsense. See the advisories in lib/scaling.ts.
   */
  it.each([
    "Salt to taste",
    "Vegetable oil, for frying",
    "Flour, for dusting",
    "Water, as needed",
    "Parsley, to serve",
  ])("marks %s as unscalable", (line) => {
    expect(parseIngredientLine(line).scalable).toBe(false);
  });

  it("marks ordinary measured lines as scalable", () => {
    expect(parseIngredientLine("2 tsp salt").scalable).toBe(true);
  });

  it("detects optional markers", () => {
    expect(parseIngredientLine("1 tbsp chilli flakes (optional)").optional).toBe(true);
    expect(parseIngredientLine("1 tbsp chilli flakes").optional).toBe(false);
  });
});

describe("robustness", () => {
  it("preserves rawText exactly, since every other field derives from it", () => {
    const line = "1 1/2 cups all-purpose flour, sifted";
    expect(parseIngredientLine(line).rawText).toBe(line);
  });

  it("strips list markers left by copy-and-paste", () => {
    expect(parseIngredientLine("- 2 eggs").quantity).toBe(2);
    expect(parseIngredientLine("• 2 eggs").quantity).toBe(2);
  });

  it("parses a block, skipping blank lines", () => {
    const block = "2 eggs\n\n500 g flour\n  \n1 tsp salt";
    const parsed = parseIngredientBlock(block);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.name)).toEqual(["eggs", "flour", "salt"]);
  });

  it("never throws on adversarial input", () => {
    for (const line of ["", "   ", "///", "1/", "((()))", "🥕", "-".repeat(500)]) {
      expect(() => parseIngredientLine(line)).not.toThrow();
    }
  });
});

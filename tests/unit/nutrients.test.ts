import { describe, expect, it } from "vitest";
import {
  formatNutrient,
  NUTRIENT_KEYS,
  NUTRIENTS,
  nutrientDef,
  nutrientVector,
  nutrientsInGroup,
  percentOfReference,
  zeroTotals,
  type NutrientKey,
} from "@/lib/nutrition/nutrients";

/**
 * Tests for the nutrient table.
 *
 * The table drives the library schema, the aggregation, the panel and all four
 * export formats, so a mistake in it is a mistake in all of them at once. Most
 * of what is checked here is therefore structural — that the table is
 * well-formed — rather than arithmetic.
 */

describe("the table", () => {
  it("has no duplicate keys", () => {
    expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_KEYS.length);
  });

  it("gives every nutrient a label, a unit and a precision", () => {
    for (const def of NUTRIENTS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(["kcal", "g", "mg", "µg"]).toContain(def.unit);
      expect(def.decimals).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * A reference intake of zero would divide by zero in `percentOfReference`,
   * and a negative one is meaningless. Null is the way to say "no reference
   * exists", and it must be the only way.
   */
  it("states a positive reference intake or none at all", () => {
    for (const def of NUTRIENTS) {
      if (def.reference !== null) expect(def.reference).toBeGreaterThan(0);
    }
  });

  it("requires exactly the four energy-bearing fields", () => {
    const required = NUTRIENTS.filter((n) => n.required).map((n) => n.key);
    expect([...required].sort()).toEqual(["carbs", "fat", "kcal", "protein"]);
  });

  it("puts every nutrient in exactly one group", () => {
    const grouped = (["energy", "macro", "mineral", "vitamin"] as const).flatMap((g) =>
      nutrientsInGroup(g).map((d) => d.key),
    );
    expect([...grouped].sort()).toEqual([...NUTRIENT_KEYS].sort());
  });
});

describe("building a vector", () => {
  /**
   * The load-bearing default. An ingredient with no zinc figure has *unknown*
   * zinc, and the difference between that and 0 mg is the difference between a
   * gap the interface reports and a lie it tells silently.
   */
  it("fills what it is not told with null, never zero", () => {
    const vector = nutrientVector({ kcal: 100, protein: 5 });
    expect(vector.kcal).toBe(100);
    expect(vector.zincMg).toBeNull();
    expect(vector.folateUg).toBeNull();
  });

  it("carries an explicit zero through as a zero", () => {
    expect(nutrientVector({ vitaminCMg: 0 }).vitaminCMg).toBe(0);
  });

  it("produces every key, so a consumer can iterate the table", () => {
    const vector = nutrientVector({});
    for (const key of NUTRIENT_KEYS) expect(key in vector).toBe(true);
  });

  it("starts an aggregate at zero on every field", () => {
    const totals = zeroTotals();
    for (const key of NUTRIENT_KEYS) expect(totals[key]).toBe(0);
  });
});

describe("reference intakes", () => {
  it("gives a percentage against the stated reference", () => {
    // Vitamin C's reference is 80 mg, so 40 mg is half a day.
    expect(percentOfReference("vitaminCMg", 40)).toBeCloseTo(50, 10);
  });

  /**
   * Cholesterol has no reference intake in the EU schedule or anywhere else,
   * so the panel must show no percentage rather than invent a denominator.
   */
  it("returns null where no reference exists", () => {
    expect(nutrientDef("cholesterolMg").reference).toBeNull();
    expect(percentOfReference("cholesterolMg", 200)).toBeNull();
  });
});

describe("formatting", () => {
  it("rounds to the precision the unit deserves", () => {
    // Sodium to the milligram; zinc to a tenth, where a tenth is meaningful.
    expect(formatNutrient("sodiumMg", 412.7)).toBe("413");
    expect(formatNutrient("zincMg", 1.249)).toBe("1.2");
  });

  it("does not print a recurring decimal", () => {
    for (const key of NUTRIENT_KEYS) {
      expect(formatNutrient(key, 1 / 3)).not.toMatch(/\d{4}/);
    }
  });

  it("rejects a key that is not in the table", () => {
    expect(() => nutrientDef("vitaminQ" as NutrientKey)).toThrow(/Unknown nutrient/);
  });
});

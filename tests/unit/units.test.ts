import { describe, expect, it } from "vitest";
import { UNITS, convert, displayUnitsFor, toBase, toGrams } from "@/lib/units";

/**
 * Tests for unit conversion.
 *
 * The central property is that within-dimension conversion is a group action of
 * the positive reals under multiplication: associative, invertible, and
 * path-independent. The round-trip tests assert invertibility directly, which is
 * what rules out the accumulated-error failure mode that a graph-search
 * implementation would introduce.
 */

const MASS = ["g", "kg", "oz", "lb"];
const VOLUME = ["ml", "l", "tsp", "tbsp", "cup", "floz", "pint", "quart", "gallon"];

describe("within-dimension conversion", () => {
  it("round-trips every mass unit pair", () => {
    for (const from of MASS) {
      for (const to of MASS) {
        const there = convert(100, from, to);
        expect(there).not.toBeNull();
        const back = convert(there as number, to, from);
        // 1e-9 relative: double precision over factors spanning 1 to 1000 loses
        // far less than this, so a looser bound would hide a real error.
        expect(back as number).toBeCloseTo(100, 9);
      }
    }
  });

  it("round-trips every volume unit pair", () => {
    for (const from of VOLUME) {
      for (const to of VOLUME) {
        const there = convert(100, from, to);
        const back = convert(there as number, to, from);
        expect(back as number).toBeCloseTo(100, 9);
      }
    }
  });

  /**
   * Path independence. Converting cups -> tbsp -> ml must agree exactly with
   * cups -> ml. This is the property that makes the star-shaped lookup table
   * correct and a conversion graph unnecessary.
   */
  it("is path-independent", () => {
    const direct = convert(2, "cup", "ml") as number;
    const viaTbsp = convert(convert(2, "cup", "tbsp") as number, "tbsp", "ml") as number;
    const viaFloz = convert(convert(2, "cup", "floz") as number, "floz", "ml") as number;
    expect(viaTbsp).toBeCloseTo(direct, 9);
    expect(viaFloz).toBeCloseTo(direct, 9);
  });

  it("uses the documented factors", () => {
    // These are the values the maths doc commits to; a silent change to any of
    // them would shift every macro figure in the application.
    expect(toBase(1, "cup")).toBe(240);
    expect(toBase(1, "tbsp")).toBe(15);
    expect(toBase(1, "tsp")).toBe(5);
    expect(toBase(1, "lb")).toBe(453.59237);
    expect(toBase(1, "oz")).toBe(28.349523125);
    // 3 tsp = 1 tbsp, and 16 tbsp = 1 cup, both exactly.
    expect(convert(3, "tsp", "tbsp")).toBe(1);
    expect(convert(16, "tbsp", "cup")).toBe(1);
  });

  it("refuses to convert across dimensions", () => {
    // Volume-to-mass is a property of the substance, not the units, so this
    // must fail here rather than guessing.
    expect(convert(1, "cup", "g")).toBeNull();
    expect(convert(1, "g", "ml")).toBeNull();
    expect(convert(1, "clove", "g")).toBeNull();
  });

  it("returns null for unknown units", () => {
    expect(convert(1, "smidgen", "g")).toBeNull();
    expect(toBase(1, "smidgen")).toBeNull();
  });
});

describe("toGrams", () => {
  it("converts mass units without needing substance properties", () => {
    expect(toGrams(2, "kg")).toBe(2000);
    expect(toGrams(1, "lb")).toBeCloseTo(453.59237, 9);
  });

  it("converts volume using the substance density", () => {
    // Water: rho = 1.00 g/ml, so 1 cup = 240 g.
    expect(toGrams(1, "cup", { densityGPerMl: 1.0 })).toBe(240);
    // All-purpose flour: rho ~ 0.53 g/ml spooned and levelled.
    expect(toGrams(1, "cup", { densityGPerMl: 0.53 })).toBeCloseTo(127.2, 6);
  });

  it("converts counts using the substance per-item mass", () => {
    expect(toGrams(3, null, { gramsPerUnit: 50 })).toBe(150);
    expect(toGrams(2, "clove", { gramsPerUnit: 3 })).toBe(6);
  });

  /**
   * The most important behaviour in this module. A default here would be
   * indistinguishable from real data in the macro totals, which is precisely
   * what the coverage metric of §3 exists to expose.
   */
  it("returns null, never a default, when the conversion is undefined", () => {
    expect(toGrams(1, "cup", {})).toBeNull();
    expect(toGrams(1, "cup", { densityGPerMl: null })).toBeNull();
    expect(toGrams(3, null, {})).toBeNull();
    expect(toGrams(2, "clove", {})).toBeNull();
    expect(toGrams(1, "smidgen", { densityGPerMl: 1 })).toBeNull();
  });

  it("rejects non-positive and non-finite substance properties", () => {
    // A zero or negative density is data corruption, not a measurement; using
    // it would silently produce a zero-mass ingredient.
    expect(toGrams(1, "cup", { densityGPerMl: 0 })).toBeNull();
    expect(toGrams(1, "cup", { densityGPerMl: -1 })).toBeNull();
    expect(toGrams(Number.NaN, "g")).toBeNull();
    expect(toGrams(Number.POSITIVE_INFINITY, "g")).toBeNull();
  });
});

describe("display unit selection", () => {
  it("returns display units largest first", () => {
    const volume = displayUnitsFor("volume", "imperial");
    const factors = volume.map((u) => u.factor);
    expect(factors).toEqual([...factors].sort((a, b) => b - a));
  });

  it("excludes input-only units from display", () => {
    // Nobody writes a recipe in gallons, and fluid ounces lose to the
    // tsp/tbsp/cup ladder that cooks own equipment for.
    const keys = displayUnitsFor("volume", "imperial").map((u) => u.key);
    expect(keys).not.toContain("gallon");
    expect(keys).not.toContain("quart");
    expect(keys).not.toContain("pint");
    expect(keys).not.toContain("floz");
    expect(keys).toEqual(["cup", "tbsp", "tsp"]);
    // But they remain convertible as input.
    expect(UNITS["pint"]).toBeDefined();
    expect(convert(1, "pint", "ml")).toBeCloseTo(473.176473, 6);
    expect(convert(1, "floz", "ml")).toBeCloseTo(29.5735295625, 6);
  });

  it("never mixes systems within a dimension", () => {
    // The filter that keeps a metric recipe metric.
    expect(displayUnitsFor("mass", "metric").map((u) => u.key)).toEqual(["kg", "g"]);
    expect(displayUnitsFor("mass", "imperial").map((u) => u.key)).toEqual(["lb", "oz"]);
    expect(displayUnitsFor("volume", "metric").map((u) => u.key)).toEqual(["l", "ml"]);
  });
});

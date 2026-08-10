/**
 * Units and conversion.
 *
 * Implements §1 of docs/mathematics.md. Pure: no database, no network, no clock.
 *
 * Units partition by physical dimension. Within a dimension each unit `u`
 * carries a fixed factor `lambda_u` to that dimension's base unit, so a
 * quantity `(q, u)` has canonical magnitude `q * lambda_u` and conversion is
 * the scalar map `q -> q * lambda_1 / lambda_2`.
 *
 * A lookup table is sufficient. This problem is often modelled as a graph with
 * units as vertices and conversions as edges, solved by path search — but since
 * every unit in a dimension has a factor to a *common* base, that graph is a
 * star and any path through it collapses to a single product. Graph search
 * would buy nothing and would introduce path-dependent floating point, where
 * cups -> tbsp -> ml could disagree with cups -> ml.
 */

export type Dimension = "mass" | "volume" | "count";

/**
 * Measurement system.
 *
 * Rendering never crosses systems. A recipe written in grams must not come back
 * as pounds, and one written in cups must not come back as millilitres: the
 * arithmetic would be right and the result still wrong, because the cook has
 * one set of equipment out and is following a recipe in one idiom. Crossing
 * systems is a conversion the user asks for, not something scaling does behind
 * their back.
 */
export type System = "metric" | "imperial" | "count";

export interface UnitDefinition {
  /** Canonical key, matching the output of `ingredient-parser`. */
  readonly key: string;
  readonly dimension: Dimension;
  readonly system: System;
  /** lambda_u: multiplier to the dimension's base unit (g, ml, item). */
  readonly factor: number;
  /** Singular display form. */
  readonly label: string;
  /** Plural display form; equal to `label` for units that do not inflect. */
  readonly plural: string;
  /**
   * Whether this unit may be *chosen* when rendering a scaled quantity.
   *
   * False for units that are legitimate input but poor output: nobody writes a
   * recipe in gallons, and "0.3 pints" is worse than "170 ml".
   */
  readonly display: boolean;
}

/**
 * Conversion factors.
 *
 * Volumetric values are the US customary definitions, which are what recipe
 * sites and American cookbooks mean. They are exact by definition against the
 * millilitre:
 *   1 US legal cup   = 240 ml exactly (FDA nutrition labelling)
 *   1 US tablespoon  = 15 ml,  1 US teaspoon = 5 ml
 *   1 US fluid ounce = 29.5735295625 ml (exact: 1/128 US gallon)
 *
 * The 240 ml cup is chosen over the 236.588 ml US customary cup deliberately:
 * it is the value used on nutrition labels, which is the domain this
 * application feeds, and the 1.4% difference is far below domestic measuring
 * error. Mixing the two would be worse than choosing either.
 *
 * Mass values are exact by international agreement:
 *   1 oz = 28.349523125 g,  1 lb = 453.59237 g
 */
export const UNITS: Readonly<Record<string, UnitDefinition>> = {
  // --- mass (base: gram) ---
  g: {
    key: "g",
    system: "metric",
    dimension: "mass",
    factor: 1,
    label: "g",
    plural: "g",
    display: true,
  },
  kg: {
    key: "kg",
    system: "metric",
    dimension: "mass",
    factor: 1000,
    label: "kg",
    plural: "kg",
    display: true,
  },
  oz: {
    key: "oz",
    system: "imperial",
    dimension: "mass",
    factor: 28.349523125,
    label: "oz",
    plural: "oz",
    display: true,
  },
  lb: {
    key: "lb",
    system: "imperial",
    dimension: "mass",
    factor: 453.59237,
    label: "lb",
    plural: "lb",
    display: true,
  },

  // --- volume (base: millilitre) ---
  ml: {
    key: "ml",
    system: "metric",
    dimension: "volume",
    factor: 1,
    label: "ml",
    plural: "ml",
    display: true,
  },
  l: {
    key: "l",
    system: "metric",
    dimension: "volume",
    factor: 1000,
    label: "l",
    plural: "l",
    display: true,
  },
  tsp: {
    key: "tsp",
    system: "imperial",
    dimension: "volume",
    factor: 5,
    label: "tsp",
    plural: "tsp",
    display: true,
  },
  tbsp: {
    key: "tbsp",
    system: "imperial",
    dimension: "volume",
    factor: 15,
    label: "tbsp",
    plural: "tbsp",
    display: true,
  },
  cup: {
    key: "cup",
    system: "imperial",
    dimension: "volume",
    factor: 240,
    label: "cup",
    plural: "cups",
    display: true,
  },
  // Input-only, like the larger measures below. Recipes are written in fluid
  // ounces, but rendering into them is worse than the tsp/tbsp/cup ladder that
  // cooks actually own equipment for: 15 ml is "1 tbsp", not "½ fl oz", even
  // though fl oz is the larger unit.
  floz: {
    key: "floz",
    system: "imperial",
    dimension: "volume",
    factor: 29.5735295625,
    label: "fl oz",
    plural: "fl oz",
    display: false,
  },
  pint: {
    key: "pint",
    system: "imperial",
    dimension: "volume",
    factor: 473.176473,
    label: "pint",
    plural: "pints",
    display: false,
  },
  quart: {
    key: "quart",
    system: "imperial",
    dimension: "volume",
    factor: 946.352946,
    label: "quart",
    plural: "quarts",
    display: false,
  },
  gallon: {
    key: "gallon",
    system: "imperial",
    dimension: "volume",
    factor: 3785.411784,
    label: "gallon",
    plural: "gallons",
    display: false,
  },

  // --- count (base: one item) ---
  // Countable "units" with no intrinsic size. They convert to mass only through
  // an ingredient's gramsPerUnit, never through this table.
  clove: {
    key: "clove",
    system: "count",
    dimension: "count",
    factor: 1,
    label: "clove",
    plural: "cloves",
    display: true,
  },
  can: {
    key: "can",
    system: "count",
    dimension: "count",
    factor: 1,
    label: "can",
    plural: "cans",
    display: true,
  },
  pinch: {
    key: "pinch",
    system: "count",
    dimension: "count",
    factor: 1,
    label: "pinch",
    plural: "pinches",
    display: true,
  },
};

export function getUnit(key: string | null | undefined): UnitDefinition | null {
  if (!key) return null;
  return UNITS[key] ?? null;
}

/** Canonical magnitude `q * lambda_u` in the dimension's base unit. */
export function toBase(quantity: number, unitKey: string): number | null {
  const unit = getUnit(unitKey);
  return unit ? quantity * unit.factor : null;
}

/**
 * Converts between two units of the same dimension.
 *
 * Returns null across dimensions: that conversion is a property of the
 * substance, not of the units, and is handled by `toGrams`.
 */
export function convert(quantity: number, fromKey: string, toKey: string): number | null {
  const from = getUnit(fromKey);
  const to = getUnit(toKey);
  if (!from || !to || from.dimension !== to.dimension) return null;
  return (quantity * from.factor) / to.factor;
}

/** Per-ingredient properties needed to cross dimensions. See §1 of the maths doc. */
export interface SubstanceProperties {
  /** rho, grams per millilitre. */
  densityGPerMl?: number | null | undefined;
  /** mu, grams per countable item. */
  gramsPerUnit?: number | null | undefined;
}

/**
 * Mass in grams of `quantity` of `unitKey`, for a substance with the given
 * properties.
 *
 * Returns **null**, never a default, when the conversion is undefined:
 *
 *  - a volume with no known rho,
 *  - a count with no known mu,
 *  - an unrecognised unit.
 *
 * A plausible default here would be indistinguishable from real data in the
 * macro totals, which is exactly the failure the coverage metric exists to
 * expose. Null routes the ingredient into the coverage gap instead.
 */
export function toGrams(
  quantity: number,
  unitKey: string | null | undefined,
  substance: SubstanceProperties = {},
): number | null {
  if (!Number.isFinite(quantity)) return null;

  // No unit at all — "2 eggs", "1 onion". The count is the quantity itself, so
  // mu applies directly.
  if (!unitKey) {
    const mu = substance.gramsPerUnit;
    return typeof mu === "number" && mu > 0 ? quantity * mu : null;
  }

  const unit = getUnit(unitKey);
  if (!unit) return null;

  switch (unit.dimension) {
    case "mass":
      return quantity * unit.factor;
    case "volume": {
      const rho = substance.densityGPerMl;
      if (typeof rho !== "number" || rho <= 0) return null;
      return quantity * unit.factor * rho;
    }
    case "count": {
      const mu = substance.gramsPerUnit;
      if (typeof mu !== "number" || mu <= 0) return null;
      return quantity * unit.factor * mu;
    }
  }
}

/**
 * Units eligible for display in a dimension and system, largest first.
 *
 * Sorted descending so unit selection is a linear scan. Filtering by system is
 * what keeps a metric recipe metric; see the note on `System`.
 */
export function displayUnitsFor(dimension: Dimension, system: System): UnitDefinition[] {
  return Object.values(UNITS)
    .filter(
      (unit) => unit.dimension === dimension && unit.system === system && unit.display,
    )
    .sort((a, b) => b.factor - a.factor);
}

/**
 * Correct singular/plural label for a rendered quantity.
 *
 * Singular at or below one, so a recipe reads "¾ cup" and "1 cup" but
 * "1½ cups" — which is how English recipes are actually written, and not what a
 * plain `!== 1` test produces.
 */
export function unitLabel(unit: UnitDefinition, quantity: number): string {
  return quantity <= 1 ? unit.label : unit.plural;
}

/**
 * Rendering a magnitude as a usable kitchen measurement.
 *
 * Implements §2 of docs/mathematics.md. Pure: no database, no network, no clock.
 */

import {
  displayUnitsFor,
  getUnit,
  unitLabel,
  type Dimension,
  type System,
  type UnitDefinition,
} from "@/lib/units";

/**
 * Denominators kitchen equipment actually realises: halves, thirds, quarters,
 * sixths, eighths.
 *
 * This set is the whole reason the continued-fraction algorithm is wrong for
 * this problem. Continued-fraction convergents are optimal over *all*
 * denominators, which is the wrong feasible set: the best convergent to 0.5385
 * is 7/13, an excellent approximation and completely useless, because no
 * measuring spoon realises thirteenths. Restricting to D turns an elegant
 * infinite algorithm into a six-element search — the constrained problem is
 * strictly easier than the unconstrained one.
 */
const DENOMINATORS: readonly number[] = [1, 2, 3, 4, 6, 8];

/**
 * Maximum acceptable relative error when snapping to a fraction.
 *
 * The justification is physical, not mathematical: 5% of a one-cup measure is
 * about one teaspoon, which is below the reproducibility of domestic
 * measurement — the same cook filling the same cup twice varies by more than
 * that. Tightening it produces uglier numbers with no gain in real fidelity.
 */
export const FRACTION_TOLERANCE = 0.05;

/**
 * The comfortable range for an imperial measure, in multiples of the unit.
 *
 * Imperial cooking units form a ladder (tsp, tbsp, cup) whose rungs a cook
 * steps between by counting scoops. Twelve teaspoons is four tablespoons and
 * nobody counts to twelve; a quarter cup is a real measuring cup and a
 * twentieth of one is not. So a unit is acceptable when the value lands in
 * [1/4, 4], and the ladder is climbed or descended until it does.
 *
 * The upper bound is 4 rather than, say, 3 because 4 tbsp and 4 tsp are both
 * ordinary things to write, whereas 5+ starts to read as "should have used the
 * next unit up".
 */
const IMPERIAL_MIN = 0.25;
const IMPERIAL_MAX = 4;

/** Vulgar-fraction glyphs, for the denominators in `DENOMINATORS`. */
const GLYPHS: Readonly<Record<string, string>> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
  "1/6": "⅙",
  "5/6": "⅚",
  "1/8": "⅛",
  "3/8": "⅜",
  "5/8": "⅝",
  "7/8": "⅞",
};

export interface Fraction {
  /** Whole part; 0 when the value is below 1. */
  whole: number;
  numerator: number;
  denominator: number;
  /** Relative error of this representation against the target. */
  relativeError: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Best approximation of `x` by `p/q` with `q` drawn from `DENOMINATORS`.
 *
 * For fixed q the optimal numerator is `round(q*x)`, so the search is over the
 * six denominators only. Ties break toward the smaller denominator: a cook
 * prefers 1/2 to 4/8.
 *
 * Returns null when no positive numerator exists — that is, below 1/16, where
 * every candidate rounds to zero. Callers fall back to a decimal there, which
 * is correct: no fraction in D describes 0.01 of anything.
 */
export function bestFraction(x: number): Fraction | null {
  if (!Number.isFinite(x) || x <= 0) return null;

  let best: Fraction | null = null;

  for (const q of DENOMINATORS) {
    const p = Math.round(q * x);
    if (p <= 0) continue;

    const value = p / q;
    const relativeError = Math.abs(x - value) / x;

    // Strict `<` keeps the first (smallest) denominator on a tie, since
    // DENOMINATORS is ascending.
    if (best === null || relativeError < best.relativeError) {
      const divisor = gcd(p, q);
      const reducedP = p / divisor;
      const reducedQ = q / divisor;
      best = {
        whole: Math.floor(reducedP / reducedQ),
        numerator: reducedP % reducedQ,
        denominator: reducedQ,
        relativeError,
      };
    }
  }

  return best;
}

/** Formats a fraction as `1½`, `¾`, or `2`. */
export function formatFraction(fraction: Fraction): string {
  const { whole, numerator, denominator } = fraction;
  if (numerator === 0) return String(whole);

  const key = `${numerator}/${denominator}`;
  const glyph = GLYPHS[key] ?? key;
  return whole === 0 ? glyph : `${whole}${glyph}`;
}

export interface RenderedQuantity {
  /** Human-readable amount: "3⅔", "1.4", "250". */
  amount: string;
  /** Unit label, correctly inflected; empty for a bare count. */
  unit: string;
  /**
   * The unit that was chosen, by key rather than by label.
   *
   * The label is already inflected and already English. Anything that needs to
   * say the unit in another language needs to know *which* unit it is, and
   * "cups" is a word rather than an identifier. Null for a bare count, which
   * has no unit to name.
   */
  unitKey: string | null;
  /** Amount and unit joined for display. */
  text: string;
  /** True when the amount is an exact-enough fraction rather than a decimal. */
  exact: boolean;
}

/** One decimal place, with a trailing `.0` trimmed. */
function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function empty(): RenderedQuantity {
  return { amount: "0", unit: "", unitKey: null, text: "0", exact: false };
}

/**
 * Metric rendering: whole numbers and decimals, never fractions.
 *
 * "⅔ kg" is not something anyone writes. Metric measurement exists precisely to
 * avoid fractions, so the unit ladder is climbed only to keep the number in
 * [1, 1000) and the value is then rendered as a decimal.
 */
function renderMetric(baseMagnitude: number, dimension: Dimension): RenderedQuantity {
  const units = displayUnitsFor(dimension, "metric");
  const chosen =
    units.find((unit) => baseMagnitude / unit.factor >= 1) ?? units[units.length - 1];
  if (!chosen) return empty();

  const value = baseMagnitude / chosen.factor;
  // Below 10, a decimal place carries real information (2.5 g of yeast);
  // above it, it is noise (487.3 g of flour).
  const amount = value < 10 ? formatDecimal(value) : String(Math.round(value));
  const label = unitLabel(chosen, value);
  return {
    amount,
    unit: label,
    unitKey: chosen.key,
    text: `${amount} ${label}`,
    exact: false,
  };
}

/**
 * Imperial rendering: fractions, on the unit ladder.
 *
 * Candidates are the units placing the value in the comfortable range. Among
 * them, the winner is the one with the **simplest denominator**, ties broken
 * toward the larger unit.
 *
 * Simplicity beats size because a whole number in a smaller unit is easier to
 * measure than a fraction in a larger one: 5 ml is "1 tsp", not "⅓ tbsp", even
 * though the tablespoon is larger. Size still breaks ties, so 15 ml is "1 tbsp"
 * rather than the equally-whole "3 tsp".
 *
 * The comfortable-range filter does the rest: 180 ml has no whole-number
 * candidate in range (12 tbsp and 36 tsp are both too many scoops), leaving
 * "¾ cup".
 */
function renderImperial(baseMagnitude: number, dimension: Dimension): RenderedQuantity {
  const units = displayUnitsFor(dimension, "imperial");

  interface Candidate {
    unit: UnitDefinition;
    value: number;
    fraction: Fraction;
  }

  const comfortable: Candidate[] = [];
  const representable: Candidate[] = [];

  for (const unit of units) {
    const value = baseMagnitude / unit.factor;
    const fraction = bestFraction(value);
    if (!fraction || fraction.relativeError > FRACTION_TOLERANCE) continue;

    representable.push({ unit, value, fraction });
    if (value >= IMPERIAL_MIN && value <= IMPERIAL_MAX) {
      comfortable.push({ unit, value, fraction });
    }
  }

  // Prefer a comfortable measure; failing that, any representable one; failing
  // that, fall through to a decimal below. `units` is descending by factor, so
  // a strict `<` on the denominator keeps the larger unit on a tie.
  const pool = comfortable.length > 0 ? comfortable : representable;
  const best = pool.reduce<Candidate | undefined>(
    (a, b) =>
      a === undefined || b.fraction.denominator < a.fraction.denominator ? b : a,
    undefined,
  );

  if (best) {
    const amount = formatFraction(best.fraction);
    const label = unitLabel(best.unit, best.value);
    return {
      amount,
      unit: label,
      unitKey: best.unit.key,
      text: `${amount} ${label}`,
      exact: true,
    };
  }

  const fallback =
    units.find((unit) => baseMagnitude / unit.factor >= 1) ?? units[units.length - 1];
  if (!fallback) return empty();
  const value = baseMagnitude / fallback.factor;
  const amount = formatDecimal(value);
  const label = unitLabel(fallback, value);
  return {
    amount,
    unit: label,
    unitKey: fallback.key,
    text: `${amount} ${label}`,
    exact: false,
  };
}

/**
 * Renders a canonical magnitude in the best unit of the given system.
 *
 * The system is never changed: see the note on `System` in units.ts.
 */
export function renderMagnitude(
  baseMagnitude: number,
  dimension: Dimension,
  system: System,
): RenderedQuantity {
  if (!Number.isFinite(baseMagnitude) || baseMagnitude <= 0) return empty();
  return system === "metric"
    ? renderMetric(baseMagnitude, dimension)
    : renderImperial(baseMagnitude, dimension);
}

/** Renders a bare count: "3", "2½", "0.3". */
function renderCount(quantity: number, unit: UnitDefinition | null): RenderedQuantity {
  const fraction = bestFraction(quantity);
  const exact = Boolean(fraction && fraction.relativeError <= FRACTION_TOLERANCE);
  const amount = exact && fraction ? formatFraction(fraction) : formatDecimal(quantity);
  if (!unit) return { amount, unit: "", unitKey: null, text: amount, exact };
  const label = unitLabel(unit, quantity);
  return { amount, unit: label, unitKey: unit.key, text: `${amount} ${label}`, exact };
}

/**
 * Renders a scaled ingredient quantity in the idiom it was written in.
 *
 * A quantity with no unit is a bare count ("3 eggs"). Count units (cloves,
 * cans) are rendered in place, since they have no larger or smaller sibling to
 * step to.
 */
export function renderQuantity(
  quantity: number,
  unitKey: string | null | undefined,
): RenderedQuantity {
  if (!Number.isFinite(quantity) || quantity <= 0) return empty();

  const unit = getUnit(unitKey);
  if (!unit) return renderCount(quantity, null);
  if (unit.dimension === "count") return renderCount(quantity, unit);

  return renderMagnitude(quantity * unit.factor, unit.dimension, unit.system);
}

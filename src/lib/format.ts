/**
 * Rendering numbers for people.
 *
 * Every figure in this application is derived — a density is grams per cup
 * divided by 240, a macro total is a sum of scaled fractions — and division
 * produces decimals that carry no information. `0.37083333333333335 g/ml` is
 * not more precise than `0.371`; it is the same measurement with fifteen digits
 * of floating-point noise attached, and it makes a table unreadable.
 *
 * Pure, so the rounding is testable and applies identically wherever a number
 * is shown.
 */

/**
 * Formats a number with at most `maxDecimals` places, dropping trailing zeros.
 *
 * `toFixed` alone is wrong here because it pads: `0.5` would render as `0.500`
 * in a column whose other entries need three places. Trailing zeros imply a
 * precision the figure does not have.
 */
export function decimal(value: number, maxDecimals = 3): string {
  if (!Number.isFinite(value)) return "—";
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  // `String` drops trailing zeros for free, and renders integers without a
  // decimal point at all — which is what a whole number should look like.
  return String(rounded);
}

/** Formats a value that may be absent, for a table cell. */
export function decimalOrDash(value: number | null | undefined, maxDecimals = 3): string {
  return value === null || value === undefined ? "—" : decimal(value, maxDecimals);
}

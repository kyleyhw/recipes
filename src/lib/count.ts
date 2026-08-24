import { formatFraction } from "@/lib/quantity";

/**
 * How many of a thing a weight comes to.
 *
 * The ingredient library stores mu, the mass of one countable item, because
 * nutrition needs it: "2 eggs" is 100 g only if something knows an egg weighs
 * 50 g. This module runs that conversion the other way, which is the direction
 * a cook actually stands in. A recipe says 400 g of white cabbage; the shop
 * sells heads. Nobody weighs a cabbage in the aisle.
 *
 * Two things make this different from `renderQuantity`, and both come from the
 * fact that the answer is a *count of physical objects* rather than a
 * measurement:
 *
 *  - Halves and whole numbers only. `bestFraction` will happily return three
 *    eighths, which is the correct answer to the arithmetic and a useless
 *    instruction about an onion. Kitchen equipment realises sixths and eighths;
 *    vegetables do not.
 *  - Never zero, and never rounded away. A count that rounds to nothing is a
 *    count that should not have been shown, and the caller is told so with
 *    null rather than handed "0 cloves".
 *
 * Rounding to the nearest half is a loss of precision, so it says so: anything
 * more than a tenth off the true figure comes back marked approximate, and the
 * word "about" is the caller's to add.
 */

export interface RenderedCount {
  /** The count as rounded, in units. Always positive. */
  count: number;
  /** "2 heads", "1½ cucumbers", "7 cloves". */
  text: string;
  /** True when rounding moved the figure by more than a tenth. */
  approximate: boolean;
}

/** Anything with a countable noun attached. */
export interface NamedUnit {
  /** Singular noun for one of them. */
  unitName: string;
  /** Plural, where an -s is wrong. */
  unitNamePlural?: string | null | undefined;
}

export interface CountableUnit extends NamedUnit {
  /** mu, grams per item. */
  gramsPerUnit: number;
}

/**
 * The plural of a unit noun.
 *
 * The -s rule with an -es exception for sibilant endings, and an explicit
 * override for everything it gets wrong. English pluralisation is not
 * derivable and this does not pretend otherwise — the library carries the
 * irregulars (leaf/leaves, chilli/chillies) as data because that is the only
 * way to be right about them.
 */
export function pluralise(
  unitName: string,
  unitNamePlural?: string | null | undefined,
): string {
  if (unitNamePlural) return unitNamePlural;
  if (/(s|x|z|ch|sh)$/.test(unitName)) return `${unitName}es`;
  return `${unitName}s`;
}

/**
 * "1 clove", "2 heads", "1½ cucumbers", "½ head".
 *
 * Singular at one *and below* it: English takes "half a sachet", not "half a
 * sachets", while "one and a half" goes back to the plural. So the test is
 * `<= 1` rather than `=== 1`, which is the sort of thing that looks like an
 * off-by-one until you say both out loud.
 */
function nameFor(count: number, named: NamedUnit): string {
  return count <= 1 ? named.unitName : pluralise(named.unitName, named.unitNamePlural);
}

/**
 * `grams` of an ingredient, as a count of its items.
 *
 * Null when there is nothing useful to say: a non-finite or non-positive mass,
 * or a mass so far below one item that even half of one overstates it. An
 * eighth of an onion is a real quantity and "½ an onion" is a lie about it.
 */
export function renderCount(grams: number, unit: CountableUnit): RenderedCount | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  if (!Number.isFinite(unit.gramsPerUnit) || unit.gramsPerUnit <= 0) return null;

  const exact = grams / unit.gramsPerUnit;
  // Below a quarter of an item there is no honest count to give.
  if (exact < 0.25) return null;

  // Halves are useful up to about three; past that nobody halves an onion, and
  // "6½ cloves" is a joke at the reader's expense.
  const count = exact < 3 ? Math.round(exact * 2) / 2 : Math.round(exact);
  if (count <= 0) return null;

  const whole = Math.floor(count);
  const half = count - whole > 0;
  const text = formatFraction({
    whole,
    numerator: half ? 1 : 0,
    denominator: 2,
    relativeError: 0,
  });

  return {
    count,
    text: `${text} ${nameFor(count, unit)}`,
    approximate: Math.abs(count - exact) / exact > 0.1,
  };
}

export interface MadeUpFrom extends NamedUnit {
  /** Millilitres of finished liquid one unit makes. */
  perMl: number;
}

/**
 * How many packets a volume of reconstituted liquid takes.
 *
 * Same rounding as `renderCount` and for the same reason — a sachet is a
 * physical object — but with no lower cut-off beyond a half. Half a dashi
 * packet is a real instruction: the bag is a teabag of powder and it can be
 * cut open and shared between two pans. A quarter of one cannot, which is why
 * the floor is a half rather than a quarter.
 *
 * The water is not computed. It is the recipe's own volume, because you brew
 * what the recipe asks for; the count is what has to move.
 */
export function renderMadeUp(ml: number, madeUp: MadeUpFrom): RenderedCount | null {
  if (!Number.isFinite(ml) || ml <= 0) return null;
  if (!Number.isFinite(madeUp.perMl) || madeUp.perMl <= 0) return null;

  const exact = ml / madeUp.perMl;
  const count = Math.max(0.5, exact < 3 ? Math.round(exact * 2) / 2 : Math.round(exact));

  const whole = Math.floor(count);
  const text = formatFraction({
    whole,
    numerator: count - whole > 0 ? 1 : 0,
    denominator: 2,
    relativeError: 0,
  });

  return {
    count,
    text: `${text} ${nameFor(count, madeUp)}`,
    approximate: Math.abs(count - exact) / exact > 0.1,
  };
}

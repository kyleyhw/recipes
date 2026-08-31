/**
 * How much alcohol and caffeine a serving actually carries.
 *
 * `content/diet.ts` answers *is there any*, which is the right question for a
 * filter: somebody avoiding alcohol strictly wants a recipe with vanilla
 * extract in it to fail `no-alcohol`, because the extract is 35% ethanol and
 * that is a fact about the bottle whatever the quantity. This module answers
 * *how much*, which is the right question for a label.
 *
 * The two need separating because the tag alone makes a hopeless label. Tagged
 * naively, "Contains alcohol" appears on a jug of sangria and on a chocolate
 * chip cookie, which carries half a teaspoon of vanilla extract shared between
 * twenty-four of them. The label on the cookie is not merely useless; it is the
 * kind of useless that teaches a reader to ignore the one on the jug.
 *
 * ## The arithmetic
 *
 * ABV is by volume and the library resolves lines to grams, so the conversion
 * runs back through the ingredient's own density:
 *
 *     ml of ingredient   = grams / rho
 *     ml of ethanol      = ml x abv / 100
 *     grams of ethanol   = ml of ethanol x 0.789
 *
 * Caffeine is already a mass per 100 g and needs no such trip.
 *
 * Both are then divided by the serving count, because that is the quantity a
 * label is about: nobody drinks the jug.
 *
 * ## What this deliberately does not model
 *
 * **Cooking off.** Wine boiled down in a pan keeps a fraction of its alcohol,
 * and nothing here knows what fraction. USDA publishes retention factors for
 * exactly this — roughly 85% straight off the heat, 40% after fifteen minutes
 * of simmering, 25% after an hour — but applying them needs to know how long
 * *the alcohol* was over heat, and a recipe file states how long the dish
 * cooks. Those are not the same number: the white wine in the pasta here is
 * boiled down hard for two minutes inside a twenty-minute recipe, and reading
 * `cookMinutes` as the alcohol's exposure would be an invented figure dressed
 * up in a citation.
 *
 * A first draft of this file claimed the question did not arise, on the
 * argument that anything cooked was too small to label anyway. That is simply
 * untrue and the collection disproves it: nikujaga carries 2.2 g of ethanol a
 * serving before any of it simmers away, and the white wine pasta 4.3 g. Both
 * are above the threshold and both are labelled.
 *
 * So the label means what it says and no more: **this recipe has alcohol in it
 * as an ingredient, in more than a trace.** For a dish that was cooked, less of
 * it survives to the plate than the figure implies, by an amount this file
 * cannot honestly put a number to. That is the right claim to make anyway —
 * people who avoid alcohol for religious reasons or in recovery generally do
 * avoid dishes braised in wine, and the residue is exactly why.
 *
 * Pure: no I/O, and every case is directly testable.
 */

export interface ContainsLine {
  /** Mass of this line in the whole recipe, or null where it is unknown. */
  grams: number | null;
  /** rho, needed to turn a mass back into the volume ABV is a fraction of. */
  densityGPerMl: number | null;
  abvPercent: number | null;
  caffeineMg100g: number | null;
}

export interface ContainsAmounts {
  /** Grams of ethanol in one serving. */
  ethanolG: number;
  /** Milligrams of caffeine in one serving. */
  caffeineMg: number;
}

/** Grams per millilitre of ethanol at room temperature. */
export const ETHANOL_DENSITY = 0.789;

/**
 * The ethanol, in grams per serving, at which the label is worth showing.
 *
 * A UK unit is 8 g, so this is an eighth of one — the level at which a serving
 * has stopped being a dish with a splash of something in it. Below it sit the
 * things that would otherwise make the label meaningless: half a teaspoon of
 * vanilla extract in a tray of cookies is 0.03 g a cookie, and a tablespoon of
 * shaoxing in a stir-fry for four is 0.6 g a portion.
 *
 * Above it sit the things the label exists for. A glass of the sangria here is
 * 16 g, which is two units.
 */
export const ALCOHOL_LABEL_G = 1;

/**
 * The caffeine, in milligrams per serving, at which the label is worth showing.
 *
 * A quarter of a cup of tea, which is about what a chocolate chip cookie
 * carries in its dark chocolate. That the cookie is labelled is the intended
 * behaviour rather than a threshold set too low: chocolate genuinely contains
 * caffeine, most people are surprised by it, and the question the label answers
 * is asked at eleven at night and about children.
 *
 * Below it is a dusting of cocoa on a finished plate, which is a few
 * milligrams, and which nobody needs told about.
 */
export const CAFFEINE_LABEL_MG = 10;

/** Ethanol and caffeine per serving, summed over every line that carries any. */
export function amountsPerServing(
  lines: readonly ContainsLine[],
  servings: number,
): ContainsAmounts {
  if (!Number.isFinite(servings) || servings <= 0) {
    return { ethanolG: 0, caffeineMg: 0 };
  }

  let ethanolG = 0;
  let caffeineMg = 0;

  for (const line of lines) {
    const grams = line.grams;
    if (grams === null || !Number.isFinite(grams) || grams <= 0) continue;

    // A line whose mass is known but whose density is not cannot be converted
    // to a volume, so its ABV cannot be applied. Skipped rather than guessed:
    // every alcoholic ingredient in this library is a liquid and carries rho,
    // so this branch means a row is incomplete, and understating is the safe
    // direction for a figure that is only ever compared against a threshold.
    if (line.abvPercent && line.densityGPerMl && line.densityGPerMl > 0) {
      const ml = grams / line.densityGPerMl;
      ethanolG += ((ml * line.abvPercent) / 100) * ETHANOL_DENSITY;
    }

    if (line.caffeineMg100g) {
      caffeineMg += (grams * line.caffeineMg100g) / 100;
    }
  }

  return { ethanolG: ethanolG / servings, caffeineMg: caffeineMg / servings };
}

/**
 * Whether each label has cleared its threshold.
 *
 * Returned as two booleans rather than as a list of tags so that the caller
 * keeps the ordering decision. `content/diet.ts` owns what the tags are called.
 */
export function labelsFor(
  lines: readonly ContainsLine[],
  servings: number,
): { alcohol: boolean; caffeine: boolean } {
  const amounts = amountsPerServing(lines, servings);
  return {
    alcohol: amounts.ethanolG >= ALCOHOL_LABEL_G,
    caffeine: amounts.caffeineMg >= CAFFEINE_LABEL_MG,
  };
}

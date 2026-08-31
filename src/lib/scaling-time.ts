/**
 * What scaling a recipe does to the time it takes.
 *
 * The servings stepper invites one intuition: that doubling a recipe doubles
 * everything in it. For the ingredient list that is exactly true, and the
 * stepper shows it. For the clock it is mostly false, and the way it is false
 * is worth saying on the page rather than leaving a cook to discover at the
 * oven with twice the batter and the original timer running.
 *
 * ## What holds, and why
 *
 * **Cooking and waiting are set by thickness, not by mass.** Heat and moisture
 * reach the middle of a piece of food by travelling through it, so what governs
 * the time is how far they have to go — the depth of the batter, the thickness
 * of the chop — and not how many of them are in the pan. A stew does not simmer
 * longer for being a bigger stew; the collagen in a piece of shin takes the
 * time it takes, and a second piece alongside it takes the same time, not
 * twice. A brine does not want a second night for a second piece of pork.
 *
 * And a cake in a tin scaled to hold its depth constant bakes for exactly as
 * long as it did. That is not a lucky coincidence — it is the whole purpose of
 * [`lib/tin.ts`](./tin.ts), which scales the tin's *area* with the serving
 * count precisely so that the depth, and therefore the bake, is the thing that
 * does not move. Where the tin cannot scale the depth does change, and the time
 * changes with it; `tinAdviceText` says so in the same breath as it names the
 * tin, so this module leaves that case to it rather than saying it twice.
 *
 * ## What does not hold
 *
 * **Prep grows, and by less than the recipe does.** Twice the aubergine is
 * twice the cutting, but the board, the knife and the scales come out once
 * either way. The split between the fixed part and the growing part is
 * different in every recipe — "chop six vegetables" is nearly all growing part,
 * "weigh eight dry things and whisk" is nearly none — and nothing in a recipe
 * file says which of those it is.
 *
 * So no scaled prep number is printed. Multiplying prep by alpha is wrong on
 * every recipe. Multiplying it by some invented fraction of alpha is wrong on
 * every recipe *and* looks authoritative while being wrong, which is worse.
 * The direction and the reason are what can be said honestly — the same
 * conclusion `lib/tin.ts` reaches about recomputing a bake time, reached the
 * same way and for the same reason.
 *
 * ## The pan, which is the condition the rest of it rests on
 *
 * A wok is a tin that cannot be scaled, and neither is a jug. Everything above
 * holds *because the vessel scales with the recipe*, which is true of a baking
 * tin here and true of nothing else: double a stir-fry into the same 28 cm pan
 * and it sits twice as deep, and double a jug of tea and it chills from twice
 * the depth. Depth is the quantity the whole argument turns on, so a pan that
 * does not grow turns "the time stands" into "the time stretches".
 *
 * Off a tin, then, the claim is made conditional rather than flat — the time
 * stands provided the pan does too — with the two ways out named: a wider pan,
 * or two batches. This is deliberately not framed around frying. An earlier
 * draft was, and it told a recipe for iced tea to watch that it did not steam
 * instead of frying, which is the sort of sentence that costs a reader their
 * trust in the paragraph around it. Heat travelling through a depth is the one
 * account that covers a wok, a stockpot and a jug in the fridge alike.
 *
 * Recipes do not declare their pans the way baked ones declare their tins, so
 * this is a condition rather than a computation. Turning it into a number would
 * mean knowing the pan, and a `pan:` field across the collection is a different
 * change from this one.
 *
 * ## English only
 *
 * These sentences are built here rather than in `lib/i18n/strings.ts`, which is
 * the same choice `tinAdviceText` makes and is a known limit of both: the
 * advice is prose that branches, not a phrase with holes in it, and the four
 * dictionaries hold the latter. A reader in another language sees the recipe
 * translated and this note in English.
 *
 * Pure: no I/O, so every case here is directly testable.
 */

export interface Stretches {
  prepMinutes: number | null;
  cookMinutes: number | null;
  waitMinutes: number | null;
}

/**
 * Below this the stepper has moved and the answer has not.
 *
 * Floating-point slack only. Any real change of serving count clears it by
 * many orders of magnitude, so this never suppresses advice a cook wanted.
 */
export const SCALE_EPSILON = 1e-9;

/**
 * Whether a recipe is baked, for the purpose of the wording.
 *
 * A declared tin is the signal, which is the same signal `content/format.ts`
 * uses to default `cookLabel` to "bake". One fact, read one way, in both
 * places.
 */
export interface TimeAdviceOptions {
  baked: boolean;
}

/** "a", "a and b", "a, b and c" — the list separator English actually uses. */
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A sentence or two a cook can act on, or null when nothing has changed.
 *
 * Null at the recipe's own serving count is the important case: the advice is
 * about the difference between what is printed and what you are about to cook,
 * so with no difference there is nothing to say, and a permanent paragraph
 * explaining that times have not changed is a paragraph nobody reads.
 */
export function timeAdviceText(
  stretches: Stretches,
  alpha: number,
  { baked }: TimeAdviceOptions,
): string | null {
  if (!Number.isFinite(alpha) || alpha <= 0) return null;
  if (Math.abs(alpha - 1) < SCALE_EPSILON) return null;

  const up = alpha > 1;
  const parts: string[] = [];

  // Only the stretches this recipe actually has. A recipe with no waiting must
  // not be told its waiting is unaffected: it reads as though a step has been
  // missed, and it is the sort of sentence that makes a reader distrust the
  // ones that do apply.
  const unchanged: string[] = [];
  if (stretches.cookMinutes) unchanged.push(baked ? "the bake" : "the cooking");
  if (stretches.waitMinutes) unchanged.push("the waiting");

  if (unchanged.length > 0) {
    const subject = joinAnd(unchanged);
    const verb = unchanged.length > 1 ? "stand" : "stands";
    const plural = unchanged.length > 1 ? "both are" : "it is";
    if (baked) {
      // The tin is the one vessel on the site that does scale, so a baked
      // recipe gets the unconditional version of the claim. `tinAdviceText`
      // handles the case where the cook keeps the tin they own instead.
      parts.push(
        `Scaled ${up ? "up" : "down"}, ${subject} ${verb} as written: ${plural} set by how deep the batter sits rather than how much of it there is, and the tin scales in width to keep that depth fixed.`,
      );
    } else if (up) {
      parts.push(
        `Scaled up, ${subject} ${verb} as written — provided the pan does too. ${
          unchanged.length > 1 ? "Both are" : "It is"
        } set by how far heat has to travel through what is in it, so twice as much in the same pan sits twice as deep and takes longer both to heat and to cool. Go a size wider, or do it in two.`,
      );
    } else {
      parts.push(
        `Scaled down, ${subject} ${verb} as written: ${plural} set by how far heat has to travel through what is in the pan, and less of it sits shallower, which if anything is quicker.`,
      );
    }
  }

  if (stretches.prepMinutes) {
    parts.push(
      `Only the prep ${up ? "grows" : "shrinks"} on its own, and by less than the recipe does — the board and the scales come out once — so the figure above runs a little ${
        up ? "short" : "long"
      }.`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

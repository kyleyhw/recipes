/**
 * Portion scaling.
 *
 * Implements the scaling half of §2 of docs/mathematics.md. Pure: no database,
 * no network, no clock.
 *
 * Scaling is a *view*. The stored recipe keeps its base servings, and a recipe
 * scaled to eight servings and back to four is identical to where it started.
 */

import { renderQuantity, type RenderedQuantity } from "@/lib/quantity";

/** The subset of an ingredient row that scaling needs. */
export interface ScalableIngredient {
  id: string;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  prepNote: string | null;
  optional: boolean;
  scalable: boolean;
}

export interface ScaledIngredient extends ScalableIngredient {
  /** Quantity after multiplication by alpha; null when there was none. */
  scaledQuantity: number | null;
  /** Rendered amount, or null when the line carries no quantity to render. */
  rendered: RenderedQuantity | null;
  /** Text to display: the rendered amount plus name, or the original line. */
  display: string;
  /** True when this line was deliberately left unmultiplied. */
  passedThrough: boolean;
  /** Non-null when scaling this ingredient warrants a caution. See below. */
  advisory: string | null;
}

/**
 * Threshold on |ln alpha| beyond which non-linear ingredients are flagged.
 *
 * ln(1.5) ~ 0.405, so a factor of 1.5x or 1/1.5x triggers. Below that the
 * departure from linearity is smaller than ordinary recipe tolerance and a
 * warning would be noise; a doubling or halving genuinely does change the
 * chemistry.
 *
 * The logarithm is the right measure because scaling is multiplicative: halving
 * and doubling are equally large departures from alpha = 1, and |ln alpha|
 * treats them so, while |alpha - 1| would call doubling twice as large a change
 * as halving.
 */
export const ADVISORY_LOG_THRESHOLD = Math.log(1.5);

/**
 * Ingredients whose effect is not proportional to their quantity.
 *
 * Matched against the parsed ingredient name. The application does not attempt
 * to *correct* these — doing so properly is a research problem, and a
 * plausible-looking correction factor would be fabricated precision, worse than
 * none because it would be trusted. It flags them and leaves the judgement to
 * the cook.
 */
/** What makes a dough a ferment, and salt's role in it structural. */
const FERMENT = /\b(yeast|sourdough|starter|levain|poolish|biga)\b/i;

const NON_LINEAR: ReadonlyArray<{
  pattern: RegExp;
  advisory: string;
  /**
   * A condition on the *recipe*, not the ingredient.
   *
   * Some ingredients only scale badly in company. Salt is the case that forced
   * this: in a fermented dough it regulates yeast activity and scaling it
   * changes the ferment, and in everything else it is just seasoning. Without
   * this the warning fired on every recipe containing salt, and one that
   * explained fermentation to someone making banana bread taught them to stop
   * reading the warnings.
   */
  requires?: (ingredientNames: readonly string[]) => boolean;
}> = [
  {
    pattern: /\b(baking powder|baking soda|bicarbonate|bicarb)\b/i,
    advisory:
      "Chemical leavening does not scale linearly — gas production scales with the leavener, but the batter's ability to hold it does not. Scale by less than the full factor and judge by the batter.",
  },
  {
    pattern: /\b(yeast|sourdough starter|levain)\b/i,
    advisory:
      "Yeast quantity trades off against proving time rather than scaling with the dough. Keep it closer to the original amount and prove to the dough's condition, not the clock.",
  },
  {
    pattern: /\b(salt|kosher salt|sea salt)\b/i,
    advisory:
      "Salt regulates yeast activity as well as seasoning, so scaling it linearly changes how fast this dough ferments. Keep it nearer the original proportion and prove to the dough's condition.",
    requires: (names) => names.some((name) => FERMENT.test(name)),
  },
  {
    pattern: /\b(gelatin|gelatine|agar|pectin|xanthan)\b/i,
    advisory:
      "Setting agents depend on the ratio to total liquid and on the vessel's depth, not on the batch size alone. Check the set before committing the whole batch.",
  },
  {
    pattern: /\b(chilli|chili|chile|cayenne|scotch bonnet|habanero)\b/i,
    advisory:
      "Heat compounds are perceived non-linearly; a straight multiple often lands hotter than intended. Add most of the scaled amount, then taste up to it.",
  },
];

/** A caution attached to the recipe as a whole rather than to one ingredient. */
export interface RecipeAdvisory {
  kind: "bake-time" | "eggs" | "vessel";
  text: string;
}

export interface ScaledRecipe {
  /** alpha = target / base. */
  factor: number;
  targetServings: number;
  baseServings: number;
  ingredients: ScaledIngredient[];
  advisories: RecipeAdvisory[];
}

/** Formats an egg count that has landed between whole numbers. */
function eggAdvisory(scaled: number): string | null {
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) < 0.08) return null;

  const whole = Math.floor(scaled);
  const remainder = scaled - whole;
  // Beating one extra egg and using a fraction of it is the standard kitchen
  // technique, and is more accurate than rounding a 4-egg custard to 5.
  const eighths = Math.round(remainder * 8);
  return (
    `${scaled.toFixed(1)} eggs: beat ${whole + 1} eggs together and use ` +
    `${eighths}/8 of the mixture by weight, discarding the rest.`
  );
}

/**
 * Scales a recipe to a target serving count.
 *
 * Every quantity with `scalable: true` is multiplied by alpha and re-rendered.
 * Lines with `scalable: false` — "salt to taste", "oil for frying" — pass
 * through untouched, since multiplying them produces confident nonsense.
 */
export function scaleRecipe(
  ingredients: readonly ScalableIngredient[],
  baseServings: number,
  targetServings: number,
  options: { cookMinutes?: number | null | undefined } = {},
): ScaledRecipe {
  // A non-positive base would make alpha undefined or negative. Guarding here
  // keeps every downstream consumer from having to.
  const base = baseServings > 0 ? baseServings : 1;
  const target = targetServings > 0 ? targetServings : base;
  const factor = target / base;

  const logFactor = Math.abs(Math.log(factor));
  const flagNonLinear = logFactor > ADVISORY_LOG_THRESHOLD;

  const allNames = ingredients.map((ingredient) => ingredient.name);

  const scaled: ScaledIngredient[] = ingredients.map((ingredient) => {
    if (!ingredient.scalable || ingredient.quantity === null) {
      return {
        ...ingredient,
        scaledQuantity: ingredient.quantity,
        rendered: null,
        display: ingredient.rawText,
        passedThrough: true,
        advisory: null,
      };
    }

    const scaledQuantity = ingredient.quantity * factor;
    const rendered = renderQuantity(scaledQuantity, ingredient.unit);

    const advisoryMatch = flagNonLinear
      ? NON_LINEAR.find(
          (entry) =>
            entry.pattern.test(ingredient.name) &&
            (entry.requires === undefined || entry.requires(allNames)),
        )
      : undefined;

    const parts = [rendered.text, ingredient.name];
    const display = ingredient.prepNote
      ? `${parts.join(" ")}, ${ingredient.prepNote}`
      : parts.join(" ");

    return {
      ...ingredient,
      scaledQuantity,
      rendered,
      display,
      passedThrough: false,
      advisory: advisoryMatch?.advisory ?? null,
    };
  });

  const advisories: RecipeAdvisory[] = [];

  // Eggs land between whole numbers constantly, and "2.5 eggs" is a genuinely
  // unhelpful instruction.
  const egg = scaled.find(
    (i) => !i.passedThrough && /\begg(s)?\b/i.test(i.name) && i.unit === null,
  );
  if (egg?.scaledQuantity != null) {
    const text = eggAdvisory(egg.scaledQuantity);
    if (text) advisories.push({ kind: "eggs", text });
  }

  if (flagNonLinear) {
    advisories.push({
      kind: "vessel",
      text:
        factor > 1
          ? "Use a larger pan or divide between pans rather than deepening the layer — depth changes how the middle cooks."
          : "Use a smaller pan. Spreading the reduced quantity over the original area will cook it faster and drier than intended.",
    });

    if (options.cookMinutes) {
      advisories.push({
        kind: "bake-time",
        text: "Cooking time does not scale with quantity — it is governed by heat reaching the centre, which depends on depth rather than volume. Keep the original time as a starting point and judge by the stated doneness cue.",
      });
    }
  }

  return {
    factor,
    targetServings: target,
    baseServings: base,
    ingredients: scaled,
    advisories,
  };
}

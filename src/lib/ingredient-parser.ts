/**
 * Free-text ingredient line parser.
 *
 * Splits a line such as `"1 1/2 cups all-purpose flour, sifted"` into its
 * quantity, unit, name, and preparation note. This module is pure and has no
 * database or network access, so it is directly testable.
 *
 * The parse is a *derived view*: `rawText` is always retained on the row, and
 * every field produced here is correctable by hand in the editor. That is what
 * permits a deliberately simple parser — a mistake degrades the macro estimate
 * and is visible for correction, but never corrupts the recipe.
 *
 * No model call is involved. Ingredient lines follow a strong convention
 * (quantity, unit, name, then a comma-delimited note), and a deterministic
 * parser handles the overwhelming majority at zero cost and zero latency.
 * Claude is reserved for whole-recipe import, where the input is unstructured
 * prose rather than a line in this form.
 */

/** Result of parsing one ingredient line. */
export interface ParsedIngredient {
  /** The input, unmodified. */
  rawText: string;
  /** Canonical numeric quantity, or null when the line states none. */
  quantity: number | null;
  /** Unit token as written, lowercased and singularised; null when absent. */
  unit: string | null;
  /** The ingredient itself, with quantity, unit, and notes removed. */
  name: string;
  /** Preparation note: "finely diced", "at room temperature". */
  prepNote: string | null;
  /** False when the quantity must not be multiplied when scaling. */
  scalable: boolean;
  /** True when the line marks itself optional. */
  optional: boolean;
}

/**
 * Unicode vulgar fractions, which appear constantly in recipes copied from the
 * web and would otherwise parse as part of the ingredient name.
 */
const VULGAR_FRACTIONS: Readonly<Record<string, number>> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅐": 1 / 7,
  "⅑": 1 / 9,
  "⅒": 0.1,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/**
 * Recognised unit tokens mapped to their canonical form.
 *
 * The canonical forms are the keys used by `units.ts` (phase 4). Abbreviations
 * are listed exhaustively rather than stemmed, because stemming produces
 * false positives on ingredient names — "t" for teaspoon would swallow any
 * single-letter token, and "c" for cup collides with nothing useful but invites
 * the same class of error.
 */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  // mass
  g: "g",
  gram: "g",
  grams: "g",
  gramme: "g",
  grammes: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  // volume
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  "fl oz": "floz",
  floz: "floz",
  pint: "pint",
  pints: "pint",
  quart: "quart",
  quarts: "quart",
  gallon: "gallon",
  gallons: "gallon",
  // count
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  pinch: "pinch",
  pinches: "pinch",
};

/**
 * Phrases marking a quantity that must not be scaled.
 *
 * Multiplying "salt to taste" by three produces confident nonsense, and
 * "oil for frying" describes a method rather than an amount. These lines pass
 * through scaling untouched; see docs/mathematics.md §2.
 */
const UNSCALABLE_PATTERNS: readonly RegExp[] = [
  /\bto taste\b/i,
  /\bfor (frying|greasing|dusting|brushing|drizzling|serving|garnish)\b/i,
  /\bas needed\b/i,
  /\bto serve\b/i,
];

const OPTIONAL_PATTERN = /\b(optional|if desired|to garnish)\b/i;

/**
 * Parses a leading quantity.
 *
 * Handles, in order: mixed numbers (`1 1/2`, `1½`), ASCII fractions (`3/4`),
 * vulgar fractions (`½`), ranges (`2-3`, taking the midpoint), and plain
 * decimals or integers.
 *
 * Ranges take the **midpoint** rather than the lower bound because the value
 * feeds macro computation, where the midpoint is the better estimator; the
 * original range remains visible in `rawText`.
 */
function parseQuantity(input: string): { quantity: number | null; rest: string } {
  let text = input.trimStart();

  // Expand a leading vulgar fraction into an ASCII one so a single code path
  // handles both notations, including the mixed form "1½".
  const vulgarLead = /^(\d+)?\s*([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/.exec(text);
  if (vulgarLead) {
    const whole = vulgarLead[1] ? Number(vulgarLead[1]) : 0;
    const fractionChar = vulgarLead[2];
    const fraction = fractionChar ? (VULGAR_FRACTIONS[fractionChar] ?? 0) : 0;
    return {
      quantity: whole + fraction,
      rest: text.slice(vulgarLead[0].length).trimStart(),
    };
  }

  // Mixed number: "1 1/2"
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(text);
  if (mixed) {
    const [whole, num, den] = [Number(mixed[1]), Number(mixed[2]), Number(mixed[3])];
    if (den !== 0) {
      return {
        quantity: whole + num / den,
        rest: text.slice(mixed[0].length).trimStart(),
      };
    }
  }

  // Simple fraction: "3/4"
  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(text);
  if (fraction) {
    const [num, den] = [Number(fraction[1]), Number(fraction[2])];
    if (den !== 0) {
      return { quantity: num / den, rest: text.slice(fraction[0].length).trimStart() };
    }
  }

  // Range: "2-3", "2 to 3". Midpoint, for the reason given above.
  const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/.exec(text);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return { quantity: (low + high) / 2, rest: text.slice(range[0].length).trimStart() };
  }

  // Plain number.
  const plain = /^(\d+(?:\.\d+)?)/.exec(text);
  if (plain) {
    return { quantity: Number(plain[1]), rest: text.slice(plain[0].length).trimStart() };
  }

  text = text.trimStart();
  return { quantity: null, rest: text };
}

/** Parses a unit token, if the next word is a recognised one. */
function parseUnit(input: string): { unit: string | null; rest: string } {
  // "fl oz" is the only two-word unit, so it is checked before single words.
  const twoWord = /^(fl\.?\s*oz\.?)\b/i.exec(input);
  if (twoWord) {
    return { unit: "floz", rest: input.slice(twoWord[0].length).trimStart() };
  }

  const word = /^([a-zA-Z]+)\.?\b/.exec(input);
  if (!word) return { unit: null, rest: input };

  const token = (word[1] ?? "").toLowerCase();
  const canonical = UNIT_ALIASES[token];
  if (canonical === undefined) return { unit: null, rest: input };

  return { unit: canonical, rest: input.slice(word[0].length).trimStart() };
}

/**
 * Splits the remainder into the ingredient name and a preparation note.
 *
 * The convention is a comma: `"onion, finely diced"`. Parenthesised trailing
 * text is treated the same way. Where no separator exists, the whole remainder
 * is the name.
 */
function splitNameAndNote(input: string): { name: string; prepNote: string | null } {
  const parenthesised = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(input);
  if (parenthesised) {
    const name = (parenthesised[1] ?? "").trim();
    const note = (parenthesised[2] ?? "").trim();
    if (name.length > 0) return { name, prepNote: note.length > 0 ? note : null };
  }

  const commaIndex = input.indexOf(",");
  if (commaIndex === -1) return { name: input.trim(), prepNote: null };

  const name = input.slice(0, commaIndex).trim();
  const note = input.slice(commaIndex + 1).trim();
  return { name, prepNote: note.length > 0 ? note : null };
}

/** Parses one ingredient line. Never throws; an unparseable line becomes a bare name. */
export function parseIngredientLine(rawText: string): ParsedIngredient {
  const trimmed = rawText.trim();

  // Leading list markers survive copy-and-paste from many recipe sites.
  const withoutBullet = trimmed.replace(/^[-*•·•]\s*/, "");

  const { quantity, rest: afterQuantity } = parseQuantity(withoutBullet);
  // A unit without a preceding quantity ("cups flour") is far more likely to be
  // an ingredient name than a unit, so unit parsing is gated on having found a
  // quantity first.
  const { unit, rest: afterUnit } =
    quantity === null ? { unit: null, rest: afterQuantity } : parseUnit(afterQuantity);

  const { name, prepNote } = splitNameAndNote(afterUnit);

  const scalable = !UNSCALABLE_PATTERNS.some((pattern) => pattern.test(trimmed));
  const optional = OPTIONAL_PATTERN.test(trimmed);

  return {
    rawText: trimmed,
    quantity,
    unit,
    // Fall back through progressively less-processed forms rather than to an
    // empty string: a row with no name is unusable in the interface, whereas a
    // slightly noisy one is merely ugly. `trimmed` is the last resort so that
    // input consisting only of a list marker ("-") still yields something.
    // Genuinely blank input yields "", which parseIngredientBlock filters out.
    name: name.length > 0 ? name : withoutBullet.length > 0 ? withoutBullet : trimmed,
    prepNote,
    scalable,
    optional,
  };
}

/** Parses a block of text, one ingredient per line, skipping blank lines. */
export function parseIngredientBlock(block: string): ParsedIngredient[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseIngredientLine);
}

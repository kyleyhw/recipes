/**
 * The nutrients this application knows about.
 *
 * One table, and everything else is derived from it: the ingredient library's
 * schema, the aggregation, the panel, all four export formats. Adding a
 * nutrient means adding a row here and a column of data — not editing eleven
 * files that each list the same seven fields in a slightly different order.
 *
 * ## Why the reference intakes are here and not in the component
 *
 * "12 mg of vitamin E" means nothing to almost anyone. "12 mg — 100% of a
 * day" means something. The percentage is the only form in which a
 * micronutrient figure is legible, so the reference has to travel with the
 * nutrient rather than being looked up wherever it happens to be displayed.
 *
 * The values are the EU Reference Intakes of Regulation (EU) No 1169/2011,
 * Annex XIII — the same figures on the back of a packet in a British shop, so
 * a percentage here is comparable with a percentage there. Two exceptions,
 * both noted on their rows: fibre, which Annex XIII does not set and which
 * takes the SACN (2015) recommendation of 30 g instead, and cholesterol, which
 * has no reference intake anywhere and therefore shows no percentage.
 *
 * A reference intake is a labelling convention for an average adult, not a
 * personal target. It is used here for scale, which is all it is good for.
 */

export type NutrientGroup = "energy" | "macro" | "mineral" | "vitamin";

export interface NutrientDef {
  /** Field name in a vector, and — suffixed with `100g` — in the library. */
  readonly key: string;
  readonly label: string;
  readonly unit: "kcal" | "g" | "mg" | "µg";
  /** Decimal places for display. A milligram of sodium is noise; of zinc, not. */
  readonly decimals: number;
  readonly group: NutrientGroup;
  /** Daily reference intake in the nutrient's own unit; null where none exists. */
  readonly reference: number | null;
  /**
   * Whether every library entry must carry it.
   *
   * The four energy-bearing fields are required: an ingredient without them
   * cannot contribute to a calorie count at all, and a missing one would be
   * silently read as zero. Everything else is optional and absent-means-unknown.
   */
  readonly required: boolean;
  /** Indents the row under the one above it, as a nutrition label does. */
  readonly subordinate?: boolean;
}

export const NUTRIENTS = [
  {
    key: "kcal",
    label: "Energy",
    unit: "kcal",
    decimals: 0,
    group: "energy",
    reference: 2000,
    required: true,
  },
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    decimals: 1,
    group: "macro",
    reference: 50,
    required: true,
  },
  {
    key: "carbs",
    label: "Carbohydrate",
    unit: "g",
    decimals: 1,
    group: "macro",
    reference: 260,
    required: true,
  },
  {
    key: "sugar",
    label: "of which sugars",
    unit: "g",
    decimals: 1,
    group: "macro",
    reference: 90,
    required: false,
    subordinate: true,
  },
  {
    key: "fiber",
    label: "Fibre",
    unit: "g",
    decimals: 1,
    group: "macro",
    reference: 30,
    required: false,
  },
  {
    key: "fat",
    label: "Fat",
    unit: "g",
    decimals: 1,
    group: "macro",
    reference: 70,
    required: true,
  },
  {
    key: "satFat",
    label: "of which saturates",
    unit: "g",
    decimals: 1,
    group: "macro",
    reference: 20,
    required: false,
    subordinate: true,
  },
  {
    key: "cholesterolMg",
    label: "Cholesterol",
    unit: "mg",
    decimals: 0,
    group: "macro",
    reference: null,
    required: false,
  },
  {
    key: "sodiumMg",
    label: "Sodium",
    unit: "mg",
    decimals: 0,
    group: "mineral",
    reference: 2400,
    required: false,
  },
  {
    key: "potassiumMg",
    label: "Potassium",
    unit: "mg",
    decimals: 0,
    group: "mineral",
    reference: 2000,
    required: false,
  },
  {
    key: "calciumMg",
    label: "Calcium",
    unit: "mg",
    decimals: 0,
    group: "mineral",
    reference: 800,
    required: false,
  },
  {
    key: "ironMg",
    label: "Iron",
    unit: "mg",
    decimals: 1,
    group: "mineral",
    reference: 14,
    required: false,
  },
  {
    key: "magnesiumMg",
    label: "Magnesium",
    unit: "mg",
    decimals: 0,
    group: "mineral",
    reference: 375,
    required: false,
  },
  {
    key: "zincMg",
    label: "Zinc",
    unit: "mg",
    decimals: 1,
    group: "mineral",
    reference: 10,
    required: false,
  },
  {
    key: "vitaminAUg",
    label: "Vitamin A",
    unit: "µg",
    decimals: 0,
    group: "vitamin",
    reference: 800,
    required: false,
  },
  {
    key: "vitaminCMg",
    label: "Vitamin C",
    unit: "mg",
    decimals: 1,
    group: "vitamin",
    reference: 80,
    required: false,
  },
  {
    key: "vitaminDUg",
    label: "Vitamin D",
    unit: "µg",
    decimals: 1,
    group: "vitamin",
    reference: 5,
    required: false,
  },
  {
    key: "vitaminEMg",
    label: "Vitamin E",
    unit: "mg",
    decimals: 1,
    group: "vitamin",
    reference: 12,
    required: false,
  },
  {
    key: "vitaminB12Ug",
    label: "Vitamin B12",
    unit: "µg",
    decimals: 1,
    group: "vitamin",
    reference: 2.5,
    required: false,
  },
  {
    key: "folateUg",
    label: "Folate",
    unit: "µg",
    decimals: 0,
    group: "vitamin",
    reference: 200,
    required: false,
  },
] as const satisfies readonly NutrientDef[];

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];

export const NUTRIENT_KEYS: readonly NutrientKey[] = NUTRIENTS.map((n) => n.key);

/** Per 100 g of an ingredient. Null means *unknown*, never zero. */
export type NutrientVector = Record<NutrientKey, number | null>;

/** An aggregate. Every field is a number; what is unknown is in the coverage. */
export type NutrientTotals = Record<NutrientKey, number>;

/** How much of the recipe's mass carried a figure, per nutrient. */
export type NutrientCoverage = Record<NutrientKey, number>;

export function zeroTotals(): NutrientTotals {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0])) as NutrientTotals;
}

/**
 * What a caller knows, which may be nothing.
 *
 * Spelled out rather than `Partial<NutrientVector>` because this project sets
 * `exactOptionalPropertyTypes`, under which a `Partial` field may be *absent*
 * but may not be *present and undefined* — and the library's optional columns
 * are `number | null | undefined` when they come back from a zod parse.
 */
export type KnownNutrients = { [K in NutrientKey]?: number | null | undefined };

/**
 * A vector from whatever is known, with the rest unknown.
 *
 * The point of the helper is the default: a field omitted here becomes `null`,
 * not `0`. Building these with an object literal and forgetting a key would
 * otherwise be a `TypeError` at best and an invented zero at worst.
 */
export function nutrientVector(known: KnownNutrients): NutrientVector {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, known[key] ?? null]),
  ) as NutrientVector;
}

export function nutrientDef(key: NutrientKey): NutrientDef {
  const found = NUTRIENTS.find((n) => n.key === key);
  // Unreachable while `key` is a NutrientKey; the throw is for callers that
  // reach this from parsed JSON, where the type is a promise rather than a fact.
  if (!found) throw new Error(`Unknown nutrient: ${key}`);
  return found;
}

export function nutrientsInGroup(group: NutrientGroup): readonly NutrientDef[] {
  return NUTRIENTS.filter((n) => n.group === group);
}

/** A value in its own unit, rounded to the precision that unit deserves. */
export function formatNutrient(key: NutrientKey, value: number): string {
  const { decimals } = nutrientDef(key);
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

/** Percentage of the daily reference intake, or null where none is defined. */
export function percentOfReference(key: NutrientKey, value: number): number | null {
  const { reference } = nutrientDef(key);
  if (reference === null || reference <= 0) return null;
  return (value / reference) * 100;
}

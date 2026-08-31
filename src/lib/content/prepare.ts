import type { RecipeFile } from "@/lib/content/format";
import type { LibraryIngredient } from "@/lib/content/library";
import { isDietTag, type DietTag } from "@/lib/content/diet";
import { parseIngredientLine } from "@/lib/ingredient-parser";
import { computeNutrition, type NutritionInput } from "@/lib/nutrition/compute";
import { nutrientVector, type NutrientVector } from "@/lib/nutrition/nutrients";
import type { ScalableIngredient } from "@/lib/scaling";

/**
 * Turning a recipe file into the shapes the pure modules already take.
 *
 * The scaling and nutrition modules were written against plain data with no
 * database in sight, which is why they survive this re-platform untouched:
 * `scaleRecipe` and `computeNutrition` neither know nor care whether their
 * input came from Postgres or from a Markdown file. This module is the adapter,
 * and it is the whole of the porting cost.
 *
 * Resolution against the ingredient library happens here, at build time, by
 * name. There is no USDA call and no model call at request time because there
 * are no requests: the site is static, so an ingredient either matches the
 * committed library or is reported as a coverage gap.
 */

/** Normalises for matching: case, punctuation, and preparation words. */
const PREP_WORDS = new Set([
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "crushed",
  "melted",
  "softened",
  "beaten",
  "peeled",
  "trimmed",
  "finely",
  "roughly",
  "coarsely",
  "thinly",
  "freshly",
  "fresh",
  "large",
  "medium",
  "small",
  "ripe",
  "raw",
  "cooked",
  "warm",
  "cold",
  "packed",
  "level",
  "heaped",
  "optional",
  "plus",
  "extra",
  "ground",
  "dried",
  "whole",
  "fine",
]);

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !PREP_WORDS.has(word))
    .join(" ")
    .trim();
}

/**
 * Matches an ingredient line to the library.
 *
 * Exact on the normalised name, then on the name as written, then on a
 * singularised form. Deliberately conservative and free of fuzzy matching: the
 * trigram index that made fuzzy matching safe lived in Postgres, and a loose
 * string match without it would attach the wrong nutrition data — worse than no
 * match, because a gap is visible and a wrong figure is not.
 */
export function matchIngredient(
  name: string,
  library: readonly LibraryIngredient[],
): LibraryIngredient | null {
  const normalised = normaliseName(name);
  // The bare name with any parenthesis dropped. A line may carry a count in
  // brackets — "60 ml lime juice (2 limes)" — which is for the reader and not
  // part of the name, and which `normaliseName` cannot be relied on to survive
  // because it also strips apostrophes ("bird's eye" becomes "bird s eye").
  const withoutBrackets = name
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const candidates = [
    normalised,
    name.trim().toLowerCase(),
    withoutBrackets,
    normalised.replace(/s$/, ""),
    withoutBrackets.replace(/s$/, ""),
  ];

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    const found = library.find(
      (ingredient) => ingredient.name.toLowerCase() === candidate,
    );
    if (found) return found;
  }
  return null;
}

/**
 * A library entry's per-100 g figures, as the nutrition pipeline's vector.
 *
 * Written out one field at a time on purpose: `NutrientVector` requires every
 * key, so leaving a nutrient out of this mapping is a compile error rather than
 * a column that quietly reads as unknown on every recipe in the collection.
 * `nutrientVector` supplies null for anything the entry does not carry.
 */
function vectorFor(entry: LibraryIngredient): NutrientVector {
  return nutrientVector({
    kcal: entry.kcal100g,
    protein: entry.protein100g,
    carbs: entry.carbs100g,
    fat: entry.fat100g,
    fiber: entry.fiber100g,
    sugar: entry.sugar100g,
    satFat: entry.satFat100g,
    cholesterolMg: entry.cholesterolMg100g,
    sodiumMg: entry.sodiumMg100g,
    potassiumMg: entry.potassiumMg100g,
    calciumMg: entry.calciumMg100g,
    ironMg: entry.ironMg100g,
    magnesiumMg: entry.magnesiumMg100g,
    zincMg: entry.zincMg100g,
    vitaminAUg: entry.vitaminAUg100g,
    vitaminCMg: entry.vitaminCMg100g,
    vitaminDUg: entry.vitaminDUg100g,
    vitaminEMg: entry.vitaminEMg100g,
    vitaminB12Ug: entry.vitaminB12Ug100g,
    folateUg: entry.folateUg100g,
  });
}

/**
 * What the library knows about one ingredient line, for the page to use.
 *
 * A narrow projection rather than the whole `LibraryIngredient`, because this
 * crosses into a client component and the full row carries two paragraphs of
 * prose per ingredient. The drawer already ships those once; a recipe page does
 * not need a second copy of them, one per line.
 *
 * Null for a line that matched nothing, which is the same set of lines the
 * coverage figure counts as a gap.
 */
export interface LineLibrary {
  /** The library row's own name — the key that opens the drawer at it. */
  name: string;
  /** What this line rules out. Empty for most ingredients. */
  excludes: DietTag[];
  /** How strong it is, and how caffeinated — for the "contains" labels. */
  abvPercent: number | null;
  caffeineMg100g: number | null;
  /** rho, for turning the line's volume into grams. */
  densityGPerMl: number | null;
  /** mu, for turning grams back into a count. */
  gramsPerUnit: number | null;
  unitName: string | null;
  unitNamePlural: string | null;
  madeUp: {
    unitName: string;
    unitNamePlural: string | null;
    perMl: number;
  } | null;
}

export interface PreparedRecipe {
  /** Ingredients in the shape `scaleRecipe` takes. */
  scalable: ScalableIngredient[];
  /** Ingredients in the shape `computeNutrition` takes. */
  nutrition: NutritionInput[];
  /** What each line resolved to, index by index with the two above. */
  library: Array<LineLibrary | null>;
}

/**
 * Parses every ingredient line once and produces both views of it.
 *
 * One parse, two consumers: the scaling view and the nutrition view must agree
 * about what quantity a line states, or a recipe would scale by one number and
 * compute macros from another.
 */
export function prepareRecipe(
  recipe: RecipeFile,
  library: readonly LibraryIngredient[],
): PreparedRecipe {
  const scalable: ScalableIngredient[] = [];
  const nutrition: NutritionInput[] = [];
  const resolved: Array<LineLibrary | null> = [];

  recipe.ingredients.forEach((line, index) => {
    const parsed = parseIngredientLine(line);
    // Index-based so the id is stable across builds of the same file, which
    // keeps React keys and the exported JSON deterministic.
    const id = `${recipe.slug}-${index}`;
    const match = matchIngredient(parsed.name, library);

    scalable.push({
      id,
      rawText: parsed.rawText,
      quantity: parsed.quantity,
      unit: parsed.unit,
      name: parsed.name,
      prepNote: parsed.prepNote,
      optional: parsed.optional,
      scalable: parsed.scalable,
    });

    nutrition.push({
      id,
      name: parsed.name,
      rawText: parsed.rawText,
      quantity: parsed.quantity,
      unit: parsed.unit,
      optional: parsed.optional,
      gramsOverride: null,
      macro: match ? vectorFor(match) : null,
      densityGPerMl: match?.densityGPerMl ?? null,
      gramsPerUnit: match?.gramsPerUnit ?? null,
    });

    resolved.push(
      match
        ? {
            name: match.name,
            // Unknown strings are dropped rather than carried: a typo in the
            // library must not become a tag nothing can ever satisfy.
            excludes: (match.excludes ?? []).filter(isDietTag),
            abvPercent: match.abvPercent ?? null,
            caffeineMg100g: match.caffeineMg100g ?? null,
            densityGPerMl: match.densityGPerMl ?? null,
            gramsPerUnit: match.gramsPerUnit ?? null,
            unitName: match.unitName ?? null,
            unitNamePlural: match.unitNamePlural ?? null,
            madeUp: match.madeUp
              ? {
                  unitName: match.madeUp.unitName,
                  unitNamePlural: match.madeUp.unitNamePlural ?? null,
                  perMl: match.madeUp.perMl,
                }
              : null,
          }
        : null,
    );
  });

  return { scalable, nutrition, library: resolved };
}

/**
 * The keeping notes for what a recipe leaves over.
 *
 * A recipe's Storage section is about the dish; these are about the ingredients
 * — the rest of the cabbage, the half bunch of coriander — and they belong
 * beside it, because "what do I do with what is left?" is one question and the
 * cook asks it once, standing in front of the counter.
 *
 * Only the perishables come back: a row without a `keeping` note is one where
 * the answer is "put it in the cupboard" and saying so would be noise. Order
 * follows the ingredient list, and an ingredient used twice appears once.
 */
export function keepingNotes(
  recipe: RecipeFile,
  library: readonly LibraryIngredient[],
): Array<{ name: string; keeping: string }> {
  const seen = new Set<string>();
  const notes: Array<{ name: string; keeping: string }> = [];

  for (const line of recipe.ingredients) {
    const match = matchIngredient(parseIngredientLine(line).name, library);
    if (!match?.keeping || seen.has(match.name)) continue;
    seen.add(match.name);
    notes.push({ name: match.name, keeping: match.keeping });
  }
  return notes;
}

/** Nutrition for a recipe at its base serving count. */
export function nutritionFor(recipe: RecipeFile, library: readonly LibraryIngredient[]) {
  return computeNutrition(prepareRecipe(recipe, library).nutrition, recipe.servings);
}

/** One recipe that uses an ingredient. */
export interface IngredientUse {
  slug: string;
  title: string;
}

/**
 * Which recipes use each ingredient, keyed by library name.
 *
 * The reverse of what every other part of this pipeline computes, and the
 * question a cook asks in the other direction: not "what is in this dish" but
 * "I have a jar of doubanjiang — what is it for?". It is also how the library
 * proves it is honest, since an ingredient with an empty list is one nothing
 * uses, and content/memories.md says the library holds only what is buyable and
 * shows what it is for.
 *
 * Built once at load and passed down, rather than recomputed per row: matching
 * is 163 rows against 84 recipes and would otherwise run once per row per page.
 *
 * A recipe listing the same ingredient twice — dashi in the broth and dashi in
 * the dressing — appears once.
 */
export function usedInIndex(
  recipes: readonly RecipeFile[],
  library: readonly LibraryIngredient[],
): Record<string, IngredientUse[]> {
  const index: Record<string, IngredientUse[]> = {};
  for (const ingredient of library) index[ingredient.name] = [];

  for (const recipe of recipes) {
    const seen = new Set<string>();
    for (const line of recipe.ingredients) {
      const match = matchIngredient(parseIngredientLine(line).name, library);
      if (!match || seen.has(match.name)) continue;
      seen.add(match.name);
      index[match.name]?.push({ slug: recipe.slug, title: recipe.title });
    }
  }
  return index;
}

/**
 * What a recipe rules out, and whether it is sure.
 *
 * `unknown` is true when any ingredient line failed to resolve against the
 * library, and it is the load-bearing half: an unresolved line is an ingredient
 * nothing knows anything about, so no claim can be made about the recipe at
 * all. `dietsFor` turns that into an empty list rather than into a clean bill
 * of health.
 *
 * Optional ingredients count. "Optional" describes whether the cook adds it,
 * not whether it is in the dish, and a recipe whose optional garnish is dried
 * shrimp is not a recipe to offer somebody filtering out shellfish.
 */
export function dietTags(
  recipe: RecipeFile,
  library: readonly LibraryIngredient[],
): { tags: DietTag[]; unknown: boolean } {
  const tags = new Set<DietTag>();
  let unknown = false;

  for (const line of recipe.ingredients) {
    const match = matchIngredient(parseIngredientLine(line).name, library);
    if (!match) {
      unknown = true;
      continue;
    }
    for (const tag of match.excludes ?? []) {
      if (isDietTag(tag)) tags.add(tag);
    }
  }
  return { tags: [...tags], unknown };
}

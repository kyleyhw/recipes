import "server-only";
import { db } from "@/lib/db";
import { searchUsda } from "@/lib/nutrition/usda";

/**
 * Resolving a free-text ingredient name to a canonical `Ingredient`.
 *
 * Order, cheapest first:
 *
 *   1. Exact match on the local library (case-insensitive).
 *   2. Trigram similarity against the local library, using the GIN index from
 *      the initial migration. Catches plurals, spelling variants, and word
 *      order — "butter, unsalted" against "unsalted butter".
 *   3. USDA FoodData Central, whose top match is adopted and cached locally.
 *
 * Step 3 is the only one that costs a network call, and its result is written
 * into the local library, so the same ingredient is never looked up twice. That
 * is the payoff of a shared canonical table: resolving "unsalted butter" once
 * makes every recipe using it accurate at once.
 *
 * A `MANUAL` ingredient is never overwritten by an automatic pass. An owner who
 * has corrected a figure has more authority than any database.
 */

/** Words that describe preparation rather than substance. */
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
  "room",
  "temperature",
  "packed",
  "level",
  "heaped",
  "optional",
  "plus",
  "extra",
  "good",
  "quality",
]);

/**
 * Reduces an ingredient line's name to the substance.
 *
 * "finely chopped large onions" -> "onions". Preparation words are noise for
 * matching: they describe what was done to the ingredient, not what it is, and
 * leaving them in defeats both exact and trigram matching.
 */
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
 * Minimum trigram similarity for a local match.
 *
 * Postgres' default `pg_trgm` threshold is 0.3, which is loose enough to match
 * "salt" against "shallot". 0.45 was chosen by trying the starter library
 * against realistic ingredient lines: it accepts plurals and word-order
 * variants while rejecting different foods that share a substring. A wrong
 * match here silently attaches the wrong nutrition data, which is worse than no
 * match at all — hence erring tight.
 */
const TRIGRAM_THRESHOLD = 0.45;

export interface ResolvedIngredient {
  id: string;
  name: string;
  source: "exact" | "trigram" | "usda";
}

/** Exact match on the canonical library, case-insensitive. */
async function findExact(name: string): Promise<{ id: string; name: string } | null> {
  return db.ingredient.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

/** Closest trigram match above the threshold. */
async function findSimilar(name: string): Promise<{ id: string; name: string } | null> {
  const rows = await db.$queryRaw<
    Array<{ id: string; name: string; similarity: number }>
  >`
    SELECT "id", "name", similarity("name", ${name}) AS similarity
    FROM "Ingredient"
    WHERE similarity("name", ${name}) > ${TRIGRAM_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT 1
  `;
  const best = rows[0];
  return best ? { id: best.id, name: best.name } : null;
}

/**
 * Resolves one ingredient name, creating a canonical entry from USDA if needed.
 *
 * Returns null when nothing matched, which is a *reported gap*, not a silent
 * zero: the caller records the ingredient as unresolved and the coverage metric
 * reflects it.
 */
export async function resolveIngredient(
  rawName: string,
): Promise<ResolvedIngredient | null> {
  const normalised = normaliseName(rawName);
  if (normalised.length === 0) return null;

  const exact = await findExact(normalised);
  if (exact) return { ...exact, source: "exact" };

  // Try the name as written too, in case normalisation stripped something
  // load-bearing ("fresh mozzarella" is not "mozzarella" for this purpose).
  const exactRaw = await findExact(rawName.trim());
  if (exactRaw) return { ...exactRaw, source: "exact" };

  const similar = await findSimilar(normalised);
  if (similar) return { ...similar, source: "trigram" };

  const candidates = await searchUsda(normalised, 1);
  const best = candidates[0];
  if (!best) return null;

  // Cache the USDA result into the canonical library. `upsert` on the
  // normalised name rather than `create`, because two ingredients resolving
  // concurrently would otherwise race on the unique constraint.
  const created = await db.ingredient.upsert({
    where: { name: normalised },
    update: {},
    create: {
      name: normalised,
      usdaFdcId: best.fdcId,
      kcal100g: best.macro.kcal,
      protein100g: best.macro.protein,
      carbs100g: best.macro.carbs,
      fat100g: best.macro.fat,
      fiber100g: best.macro.fiber,
      sugar100g: best.macro.sugar,
      sodiumMg100g: best.macro.sodiumMg,
      source: "USDA",
      sourceNote: `USDA FoodData Central ${best.fdcId}: ${best.description}`,
    },
    select: { id: true, name: true },
  });

  return { ...created, source: "usda" };
}

/**
 * Resolves every unresolved ingredient of a recipe.
 *
 * Sequential rather than parallel: the USDA path writes to a table with a
 * unique constraint on the name, and two ingredients normalising to the same
 * value would race. Recipes have on the order of ten ingredients, so the
 * latency cost is not worth the contention.
 *
 * Returns the number newly resolved.
 */
export async function resolveRecipeIngredients(recipeId: string): Promise<number> {
  const rows = await db.recipeIngredient.findMany({
    where: { recipeId, ingredientId: null },
    select: { id: true, name: true },
  });

  let resolved = 0;
  for (const row of rows) {
    const match = await resolveIngredient(row.name);
    if (!match) continue;
    await db.recipeIngredient.update({
      where: { id: row.id },
      data: { ingredientId: match.id },
    });
    resolved += 1;
  }
  return resolved;
}

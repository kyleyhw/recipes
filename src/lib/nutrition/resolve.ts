import "server-only";
import {
  chooseUsdaCandidate,
  estimateMacros,
  type EstimatedFood,
} from "@/lib/ai/macro-match";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
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
 *   3. USDA FoodData Central. With no Anthropic key the top hit is adopted;
 *      with one, Claude chooses among the candidates and supplies rho and mu.
 *   4. Claude's own estimate, when FoodData Central has no record or no USDA
 *      key is configured. Stored as `source: CLAUDE` so it is visibly an
 *      estimate wherever it is displayed.
 *
 * Only steps 3 and 4 leave the machine, and their results are written into the
 * local library, so the same ingredient is never looked up twice. That is the
 * payoff of a shared canonical table: resolving "unsalted butter" once makes
 * every recipe using it accurate at once — and means the billable step of the
 * chain runs once per new ingredient, not once per recipe.
 *
 * Every step after the first two is optional. With neither key set, resolution
 * stops after the trigram search and unmatched ingredients are reported as
 * coverage gaps, which is the honest degradation: a gap is visible, a
 * fabricated figure is not.
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
  source: "exact" | "trigram" | "usda" | "claude";
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

  // A wider candidate list is only worth fetching when something can judge it.
  // Without an Anthropic key the top hit is all that will be used anyway.
  const candidates = await searchUsda(normalised, features.ai ? 8 : 1);

  if (candidates.length > 0) {
    const chosen =
      candidates.length > 1 ? await chooseUsdaCandidate(normalised, candidates) : null;

    // `chosen === null` covers three cases that all mean the same thing here:
    // no Anthropic key, a failed call, and an explicit "none of these". The
    // first two should fall back to the top hit, which is what happened before
    // Claude was involved at all. The third must not — the model has said the
    // ingredient is absent from the candidate list, and adopting the top hit
    // anyway would override the only judgement that was asked for.
    if (chosen === null && features.ai && candidates.length > 1) {
      const estimated = await estimateMacros(normalised);
      if (estimated) return storeEstimate(normalised, estimated);
    }

    const best = chosen?.candidate ?? candidates[0];
    if (best) {
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
          // rho and mu come from the model, because FoodData Central does not
          // record either, and a volume or a count is unconvertible without them.
          densityGPerMl: chosen?.densityGPerMl ?? null,
          gramsPerUnit: chosen?.gramsPerUnit ?? null,
          source: "USDA",
          sourceNote: chosen
            ? `USDA FoodData Central ${best.fdcId}: ${best.description}. ` +
              `Chosen by Claude (${chosen.confidence} confidence): ${chosen.reason}`
            : `USDA FoodData Central ${best.fdcId}: ${best.description}`,
        },
        select: { id: true, name: true },
      });

      return { ...created, source: "usda" };
    }
  }

  // Nothing in FoodData Central, or no USDA key at all.
  const estimated = await estimateMacros(normalised);
  return estimated ? storeEstimate(normalised, estimated) : null;
}

/** Writes a model estimate into the canonical library, marked as an estimate. */
async function storeEstimate(
  name: string,
  estimate: EstimatedFood,
): Promise<ResolvedIngredient> {
  const created = await db.ingredient.upsert({
    where: { name },
    update: {},
    create: {
      name,
      kcal100g: estimate.kcal100g,
      protein100g: estimate.protein100g,
      carbs100g: estimate.carbs100g,
      fat100g: estimate.fat100g,
      fiber100g: estimate.fiber100g,
      sugar100g: estimate.sugar100g,
      sodiumMg100g: estimate.sodiumMg100g,
      densityGPerMl: estimate.densityGPerMl,
      gramsPerUnit: estimate.gramsPerUnit,
      source: "CLAUDE",
      sourceNote: `Estimated by Claude: ${estimate.basis}`,
    },
    select: { id: true, name: true },
  });
  return { ...created, source: "claude" };
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

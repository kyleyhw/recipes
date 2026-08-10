import "server-only";
import { z } from "zod";
import { env, features } from "@/lib/env";
import type { MacroVector } from "@/lib/nutrition/compute";

/**
 * USDA FoodData Central client.
 *
 * https://fdc.nal.usda.gov/api-guide.html — free, instant key.
 *
 * Returns null rather than throwing whenever the service is unavailable or no
 * key is configured, so nutrition lookup degrades to manual entry instead of
 * breaking the page it was called from.
 */

const BASE = "https://api.nal.usda.gov/fdc/v1";

/**
 * FDC nutrient identifiers.
 *
 * These are stable numeric ids in the USDA schema, not names: the `name` field
 * varies in spelling and case across data types ("Energy", "Energy (Atwater
 * General Factors)"), whereas the id does not.
 */
const NUTRIENT_IDS = {
  kcal: 1008, // Energy, kcal
  protein: 1003,
  fat: 1004, // Total lipid (fat)
  carbs: 1005, // Carbohydrate, by difference
  fiber: 1079, // Fiber, total dietary
  sugar: 2000, // Sugars, total
  sodiumMg: 1093, // Sodium, Na
} as const;

/**
 * Data types, in preference order.
 *
 * `Foundation` and `SR Legacy` are laboratory-analysed generic foods — "butter,
 * unsalted" — which is what a recipe ingredient means. `Branded` is
 * manufacturer-submitted label data for specific products, which is far larger
 * and far noisier: searching "flour" against it returns thousands of branded
 * mixes. It is excluded rather than merely deprioritised.
 */
const DATA_TYPES = ["Foundation", "SR Legacy"] as const;

const nutrientSchema = z.object({
  nutrientId: z.number().optional(),
  nutrientNumber: z.string().optional(),
  value: z.number().optional(),
});

const foodSchema = z.object({
  fdcId: z.number(),
  description: z.string(),
  dataType: z.string().optional(),
  foodNutrients: z.array(nutrientSchema).optional(),
});

const searchSchema = z.object({
  foods: z.array(foodSchema).optional(),
});

export interface UsdaCandidate {
  fdcId: string;
  description: string;
  dataType: string | null;
  macro: MacroVector;
}

function readNutrient(
  nutrients: ReadonlyArray<z.infer<typeof nutrientSchema>>,
  id: number,
): number | null {
  const found = nutrients.find(
    (n) => n.nutrientId === id || n.nutrientNumber === String(id),
  );
  return typeof found?.value === "number" ? found.value : null;
}

/**
 * FDC reports abridged search results per 100 g, which is the same basis the
 * `Ingredient` table stores. No conversion is needed, which is one reason the
 * schema stores macros per 100 g.
 */
function toMacroVector(food: z.infer<typeof foodSchema>): MacroVector | null {
  const nutrients = food.foodNutrients ?? [];
  const kcal = readNutrient(nutrients, NUTRIENT_IDS.kcal);
  const protein = readNutrient(nutrients, NUTRIENT_IDS.protein);
  const carbs = readNutrient(nutrients, NUTRIENT_IDS.carbs);
  const fat = readNutrient(nutrients, NUTRIENT_IDS.fat);

  // The four principal macros are required. A record missing any of them cannot
  // support a macro panel, and admitting it would put a partial row into the
  // canonical library where it would look complete.
  if (kcal === null || protein === null || carbs === null || fat === null) return null;

  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber: readNutrient(nutrients, NUTRIENT_IDS.fiber),
    sugar: readNutrient(nutrients, NUTRIENT_IDS.sugar),
    sodiumMg: readNutrient(nutrients, NUTRIENT_IDS.sodiumMg),
  };
}

/**
 * Searches FoodData Central for an ingredient name.
 *
 * Returns an empty array when no key is configured or the service is
 * unreachable — the caller cannot distinguish "no key" from "no match", and
 * should not: both mean the ingredient needs entering by hand.
 */
export async function searchUsda(query: string, limit = 8): Promise<UsdaCandidate[]> {
  if (!features.usda) return [];
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  try {
    const response = await fetch(`${BASE}/foods/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.USDA_API_KEY ?? "",
      },
      body: JSON.stringify({
        query: trimmed,
        dataType: [...DATA_TYPES],
        pageSize: limit,
        requireAllWords: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];

    const parsed = searchSchema.safeParse(await response.json());
    if (!parsed.success) return [];

    const candidates: UsdaCandidate[] = [];
    for (const food of parsed.data.foods ?? []) {
      const macro = toMacroVector(food);
      if (!macro) continue;
      candidates.push({
        fdcId: String(food.fdcId),
        description: food.description,
        dataType: food.dataType ?? null,
        macro,
      });
    }
    return candidates;
  } catch {
    // Timeout, DNS failure, malformed JSON — all mean the same thing to the
    // caller, and none should surface as an error page.
    return [];
  }
}

import type { RecipeFile } from "@/lib/content/format";
import type { LibraryIngredient } from "@/lib/content/library";
import { prepareRecipe } from "@/lib/content/prepare";
import type { StringKey } from "@/lib/i18n/strings";
import { computeNutrition } from "@/lib/nutrition/compute";

/**
 * What a listing needs to know about a recipe.
 *
 * Sorting by protein per serving means the browser has to know the protein per
 * serving — and computing it there would mean shipping the whole ingredient
 * library and the nutrition pipeline to the client to re-derive, per page load,
 * a number that cannot change between deploys.
 *
 * So it is computed once at build time and travels with the listing. This is
 * the shape that decision produces: everything a card shows or a sort reads,
 * and nothing else. The full recipe stays on its own page.
 */
export interface RecipeSummary {
  slug: string;
  title: string;
  /** The title in each language a translation exists for. */
  titles: Record<string, string>;
  /** The verb for the cooking time, per language. */
  cookLabels: Record<string, string>;
  category: string;
  cuisine: string | null;
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  cookLabel: string;
  photo: string | null;
  draft: boolean;
  /** Grams per serving. Null when nothing in the recipe resolved. */
  proteinPerServing: number | null;
  kcalPerServing: number | null;
  /**
   * Fraction of the recipe by mass with known nutrition.
   *
   * Carried so a sort by protein can be honest about it: a recipe at 20%
   * coverage has a protein figure derived from a fifth of its mass, and ranking
   * it against a fully-resolved one without saying so would be a lie told in
   * sort order.
   */
  coverage: number;
  /** Everything searchable about the recipe, lowercased, for the filter. */
  haystack: string;
}

export function summarise(
  recipe: RecipeFile,
  library: readonly LibraryIngredient[],
): RecipeSummary {
  const prepared = prepareRecipe(recipe, library);
  const nutrition = computeNutrition(prepared.nutrition, recipe.servings);
  const resolved = nutrition.coverage > 0;

  return {
    slug: recipe.slug,
    title: recipe.title,
    titles: Object.fromEntries(
      Object.entries(recipe.translations).map(([code, t]) => [code, t.title]),
    ),
    cookLabels: Object.fromEntries(
      Object.entries(recipe.translations).flatMap(([code, t]) =>
        t.cookLabel ? [[code, t.cookLabel]] : [],
      ),
    ),
    category: recipe.category,
    cuisine: recipe.cuisine,
    tags: recipe.tags,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    cookLabel: recipe.cookLabel,
    photo: recipe.photo,
    draft: recipe.draft,
    proteinPerServing: resolved ? nutrition.perServing.protein : null,
    kcalPerServing: resolved ? nutrition.perServing.kcal : null,
    coverage: nutrition.coverage,
    haystack: [
      recipe.title,
      recipe.description ?? "",
      recipe.category,
      recipe.cuisine ?? "",
      recipe.tags.join(" "),
      recipe.ingredients.join(" "),
      // Searching in the language you are reading in has to work, so every
      // translation is in the haystack too — you can type "выпечка" or
      // "банановый" and find the loaf.
      Object.values(recipe.translations)
        .map((t) =>
          [
            t.title,
            t.description ?? "",
            t.tags.join(" "),
            t.ingredientNames.join(" "),
          ].join(" "),
        )
        .join(" "),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

/** How a listing can be arranged. */
export type SortKey =
  "category" | "cuisine" | "alphabetical" | "prep-asc" | "prep-desc" | "protein-desc";

/**
 * The arrangements, in the order they are offered.
 *
 * The labels are not here. They live in the string table with everything else
 * a reader sees, and this maps each arrangement to its key there — so adding a
 * language does not mean editing this file, and adding an arrangement means
 * adding one row in each.
 */
export const SORT_KEYS: readonly SortKey[] = [
  "category",
  "cuisine",
  "alphabetical",
  "prep-asc",
  "prep-desc",
  "protein-desc",
];

export const SORT_STRING_KEYS: Record<SortKey, StringKey> = {
  category: "sortCategory",
  cuisine: "sortCuisine",
  alphabetical: "sortAlphabetical",
  "prep-asc": "sortQuickest",
  "prep-desc": "sortLongest",
  "protein-desc": "sortProtein",
};

/**
 * Recipes with nothing to sort by go last, whichever direction is asked for.
 *
 * A recipe with no prep time stated is not the quickest recipe in the
 * collection, and a recipe whose ingredients did not resolve is not the one
 * with the least protein — in both cases the figure is *unknown*, and sorting
 * unknowns to the top of either end would put them where they are most likely
 * to be misread as an answer.
 */
function withUnknownsLast(
  a: number | null,
  b: number | null,
  compare: (x: number, y: number) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/** Total time, for the prep sorts: what "quickest" actually means to a cook. */
function totalMinutes(recipe: RecipeSummary): number | null {
  if (recipe.prepMinutes === null && recipe.cookMinutes === null) return null;
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
}

/**
 * Sorts a listing.
 *
 * Every comparison falls back to the title, so the order is total: two recipes
 * with the same prep time appear in the same sequence on every render and in
 * every build, rather than in whatever order the sort happened to leave them.
 */
export function sortRecipes(
  recipes: readonly RecipeSummary[],
  key: SortKey,
): RecipeSummary[] {
  const byTitle = (a: RecipeSummary, b: RecipeSummary): number =>
    a.title.localeCompare(b.title);

  const sorted = [...recipes];
  switch (key) {
    case "alphabetical":
    case "category":
    case "cuisine":
      return sorted.sort(byTitle);
    case "prep-asc":
      return sorted.sort(
        (a, b) =>
          withUnknownsLast(totalMinutes(a), totalMinutes(b), (x, y) => x - y) ||
          byTitle(a, b),
      );
    case "prep-desc":
      return sorted.sort(
        (a, b) =>
          withUnknownsLast(totalMinutes(a), totalMinutes(b), (x, y) => y - x) ||
          byTitle(a, b),
      );
    case "protein-desc":
      return sorted.sort(
        (a, b) =>
          withUnknownsLast(a.proteinPerServing, b.proteinPerServing, (x, y) => y - x) ||
          byTitle(a, b),
      );
  }
}

/**
 * The shelf that holds recipes with no cuisine.
 *
 * A named constant because the listing has to recognise it to translate it: it
 * is the one shelf label this application invents rather than reads out of a
 * file, so it is the one that can be translated at all.
 */
export const UNATTRIBUTED_SHELF = "Unattributed";

export interface Shelf {
  name: string;
  recipes: RecipeSummary[];
}

/**
 * Divides a listing into shelves, or returns one unlabelled shelf.
 *
 * Category and cuisine are groupings; the rest are orderings. Treating them as
 * one control is deliberate — "how would you like this arranged?" is a single
 * question, and splitting it into "group by" and "sort by" asks a reader to
 * understand a distinction that only matters to whoever wrote the code.
 */
export function shelveRecipes(
  recipes: readonly RecipeSummary[],
  key: SortKey,
  categoryOrder: readonly string[] = [],
): Shelf[] {
  const sorted = sortRecipes(recipes, key);

  if (key !== "category" && key !== "cuisine") {
    return [{ name: "", recipes: sorted }];
  }

  const groups = new Map<string, RecipeSummary[]>();
  for (const recipe of sorted) {
    // A recipe with no cuisine still has to appear somewhere; dropping it from
    // the page because a field is blank would hide it entirely.
    const name =
      key === "category" ? recipe.category : (recipe.cuisine ?? UNATTRIBUTED_SHELF);
    const existing = groups.get(name);
    if (existing) existing.push(recipe);
    else groups.set(name, [recipe]);
  }

  const shelves = [...groups].map(([name, list]) => ({ name, recipes: list }));

  // Categories keep the order the collection defines — meal-shaped ones before
  // component ones — and anything invented since is appended alphabetically.
  // Cuisines have no such order, so they are alphabetical throughout.
  if (key === "category" && categoryOrder.length > 0) {
    const rank = new Map(categoryOrder.map((name, index) => [name, index]));
    shelves.sort((a, b) => {
      const ra = rank.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.name.localeCompare(b.name);
    });
  } else {
    shelves.sort((a, b) => a.name.localeCompare(b.name));
  }

  return shelves;
}

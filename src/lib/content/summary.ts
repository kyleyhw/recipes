import type { RecipeFile } from "@/lib/content/format";
import type { LibraryIngredient } from "@/lib/content/library";
import type { Attribution } from "@/lib/content/attribution";
import { prepareRecipe } from "@/lib/content/prepare";
import type { StringKey } from "@/lib/i18n/strings";
import { computeNutrition } from "@/lib/nutrition/compute";
import { totalMinutes } from "@/lib/duration";
import { assetUrl } from "@/lib/site";

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
  /**
   * Who added the recipe, from its git history. Null where the build could not
   * see the history — see lib/content/attribution.ts.
   */
  addedBy: string | null;
  /**
   * When the recipe was committed, and when it was last touched — milliseconds
   * since the epoch. From git rather than from the file, for the reason
   * `addedBy` is (see lib/content/attribution.ts), and null on a shallow clone
   * where the history the build would read is not there.
   *
   * To the second rather than to the day, which the pages display. Two thirds
   * of this collection was committed on one afternoon; a recency sort keyed on
   * the day falls back to the title for sixty recipes at once, and reports
   * alphabetical order as recency.
   */
  addedAt: number | null;
  updatedAt: number | null;
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  cookLabel: string;
  /** Unattended time — chilling, proving, drying. Counted in the total. */
  waitMinutes: number | null;
  waitLabel: string;
  waitLabels: Record<string, string>;
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
  attribution: Attribution | null = null,
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
    addedBy: attribution?.addedBy.name ?? null,
    addedAt: attribution?.addedAt ?? null,
    updatedAt: attribution?.updatedAt ?? null,
    tags: recipe.tags,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    cookLabel: recipe.cookLabel,
    waitMinutes: recipe.waitMinutes,
    waitLabel: recipe.waitLabel,
    waitLabels: Object.fromEntries(
      Object.entries(recipe.translations).flatMap(([code, t]) =>
        t.waitLabel ? [[code, t.waitLabel]] : [],
      ),
    ),
    photo: assetUrl(recipe.photo),
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
  | "category"
  | "cuisine"
  | "added-by"
  | "alphabetical"
  | "alphabetical-desc"
  | "prep-asc"
  | "prep-desc"
  | "protein-desc"
  | "protein-asc"
  | "added-desc"
  | "added-asc"
  | "edited-desc"
  | "edited-asc";

export const SORT_STRING_KEYS: Record<SortKey, StringKey> = {
  category: "sortCategory",
  cuisine: "sortCuisine",
  "added-by": "sortAddedBy",
  alphabetical: "sortAlphabetical",
  "alphabetical-desc": "sortReverseAlphabetical",
  "prep-asc": "sortQuickest",
  "prep-desc": "sortLongest",
  "protein-desc": "sortProtein",
  "protein-asc": "sortLeastProtein",
  "added-desc": "sortRecentlyAdded",
  "added-asc": "sortOldest",
  "edited-desc": "sortRecentlyEdited",
  "edited-asc": "sortLongestUntouched",
};

/**
 * Which way an arrangement runs, for the arrow beside it.
 *
 * Ascending is up: A first, quickest first, least protein first. Grouping
 * arrangements have no direction and no arrow, because "grouped by category"
 * is not a direction and an arrow next to it would be answering a question
 * nobody asked.
 */
export type SortDirection = "asc" | "desc";

export const SORT_DIRECTIONS: Record<SortKey, SortDirection | null> = {
  category: null,
  cuisine: null,
  "added-by": null,
  alphabetical: "asc",
  "alphabetical-desc": "desc",
  "prep-asc": "asc",
  "prep-desc": "desc",
  "protein-desc": "desc",
  "protein-asc": "asc",
  "added-desc": "desc",
  "added-asc": "asc",
  "edited-desc": "desc",
  "edited-asc": "asc",
};

/**
 * A row in the arrange-and-filter menu.
 *
 * One row per *question* rather than one per answer. "Quickest first" and
 * "Longest first" were two rows and are one: they are the same question asked
 * in two directions, and a menu that lists both makes the reader find the
 * opposite of what they chose in order to undo it. Clicking a row with a
 * `reverse` cycles primary → reverse → off, which is the whole of the
 * interaction and needs no explanation.
 *
 * `filter` marks the rows that also open a submenu of values. Those are the
 * ones where the collection's own content supplies the choices — its cuisines,
 * its contributors — so they cannot be listed here and are gathered from the
 * recipes at render time.
 */
export interface SortRow {
  /** What a first click gives. */
  primary: SortKey;
  /** What a second click gives, or null where the row does not toggle. */
  reverse: SortKey | null;
  /** The dimension this row can also filter on. */
  filter: FilterField | null;
}

export type FilterField = "cuisine" | "addedBy";

export const SORT_ROWS: readonly SortRow[] = [
  { primary: "category", reverse: null, filter: null },
  { primary: "cuisine", reverse: null, filter: "cuisine" },
  { primary: "added-by", reverse: null, filter: "addedBy" },
  { primary: "alphabetical", reverse: "alphabetical-desc", filter: null },
  { primary: "prep-asc", reverse: "prep-desc", filter: null },
  { primary: "protein-desc", reverse: "protein-asc", filter: null },
  { primary: "added-desc", reverse: "added-asc", filter: null },
  { primary: "edited-desc", reverse: "edited-asc", filter: null },
];

/** The arrangement a row moves to when it is clicked, given the current one. */
export function nextSort(row: SortRow, current: SortKey): SortKey {
  if (row.reverse === null) return row.primary;
  if (current === row.primary) return row.reverse;
  // Off again. `category` is the default arrangement rather than a null state:
  // the listing has to be in *some* order, and grouped by category is the one
  // the collection is built around.
  if (current === row.reverse) return "category";
  return row.primary;
}

/** What a listing is narrowed to. Null on a field means "everything". */
export interface Filters {
  cuisine: string | null;
  addedBy: string | null;
}

export const NO_FILTERS: Filters = { cuisine: null, addedBy: null };

export function filterRecipes(
  recipes: readonly RecipeSummary[],
  filters: Filters,
): RecipeSummary[] {
  return recipes.filter(
    (recipe) =>
      (filters.cuisine === null ||
        (recipe.cuisine ?? UNATTRIBUTED_SHELF) === filters.cuisine) &&
      (filters.addedBy === null ||
        (recipe.addedBy ?? UNATTRIBUTED_SHELF) === filters.addedBy),
  );
}

/**
 * The values a field actually takes across a listing, with their counts.
 *
 * Gathered from the recipes rather than declared, so a cuisine that no recipe
 * uses is never offered — a filter that returns nothing is a dead end, and one
 * that is *offered* and returns nothing reads as a bug in the site.
 */
export function filterOptions(
  recipes: readonly RecipeSummary[],
  field: FilterField,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    const value =
      (field === "cuisine" ? recipe.cuisine : recipe.addedBy) ?? UNATTRIBUTED_SHELF;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  // Alphabetical, but the catch-all last wherever the alphabet would have put
  // it. It is not a cuisine or a person; it is the absence of one, and reading
  // it in the middle of the list as though it were a name is confusing in
  // exactly the way the unknowns-last sorting rule exists to avoid.
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (a.value === UNATTRIBUTED_SHELF) return 1;
      if (b.value === UNATTRIBUTED_SHELF) return -1;
      return a.value.localeCompare(b.value);
    });
}

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

/**
 * Total time, for the prep sorts: what "quickest" actually means to a cook.
 *
 * Waiting counts. A mango pudding is fifteen minutes of work and four hours
 * before you can eat it, and sorting it above a stew that is done in ninety
 * would be answering a question nobody asked.
 */

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
    case "added-by":
      return sorted.sort(byTitle);
    case "alphabetical-desc":
      return sorted.sort((a, b) => byTitle(b, a));
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
    case "protein-asc":
      return sorted.sort(
        (a, b) =>
          withUnknownsLast(a.proteinPerServing, b.proteinPerServing, (x, y) => x - y) ||
          byTitle(a, b),
      );
    // Dates are ISO days, so they compare as strings and need no parsing. A
    // recipe with no date is one the build could not attribute, and it goes
    // last in both directions like every other unknown here.
    case "added-desc":
      return sorted.sort((a, b) => byMoment(a.addedAt, b.addedAt, -1) || byTitle(a, b));
    case "added-asc":
      return sorted.sort((a, b) => byMoment(a.addedAt, b.addedAt, 1) || byTitle(a, b));
    case "edited-desc":
      return sorted.sort(
        (a, b) => byMoment(a.updatedAt, b.updatedAt, -1) || byTitle(a, b),
      );
    case "edited-asc":
      return sorted.sort(
        (a, b) => byMoment(a.updatedAt, b.updatedAt, 1) || byTitle(a, b),
      );
  }
}

/**
 * Two moments, with the direction passed in rather than applied by swapping the
 * arguments.
 *
 * The swap is how every other reversal in this file works and it is wrong here.
 * Unknowns have to sink in *both* directions, so the comparator must be able to
 * tell "b is later than a" from "a is unknown" — and it cannot, once the caller
 * has already exchanged them. Passing -1 reverses the comparison and leaves the
 * null handling alone, which is the only part that must not reverse.
 */
function byMoment(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
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

  if (key !== "category" && key !== "cuisine" && key !== "added-by") {
    return [{ name: "", recipes: sorted }];
  }

  const groups = new Map<string, RecipeSummary[]>();
  for (const recipe of sorted) {
    // A recipe with no cuisine still has to appear somewhere; dropping it from
    // the page because a field is blank would hide it entirely.
    const name =
      key === "category"
        ? recipe.category
        : key === "cuisine"
          ? (recipe.cuisine ?? UNATTRIBUTED_SHELF)
          : (recipe.addedBy ?? UNATTRIBUTED_SHELF);
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

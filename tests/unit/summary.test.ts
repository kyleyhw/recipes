import { describe, expect, it } from "vitest";
import {
  filterOptions,
  filterRecipes,
  nextSort,
  shelveRecipes,
  sortRecipes,
  SORT_ROWS,
  SORT_STRING_KEYS,
  UNATTRIBUTED_SHELF,
  type RecipeSummary,
  type SortKey,
} from "@/lib/content/summary";

const SORT_KEYS = Object.keys(SORT_STRING_KEYS) as SortKey[];

/**
 * Tests for arranging a listing.
 *
 * The interesting decisions here are about *missing* values. A recipe with no
 * prep time stated is not the quickest recipe in the collection, and one whose
 * ingredients did not resolve is not the one with the least protein — in both
 * cases the figure is unknown, and sorting unknowns to either extreme puts them
 * exactly where they are most likely to be misread as an answer.
 */

function recipe(overrides: Partial<RecipeSummary> & { title: string }): RecipeSummary {
  return {
    titles: {},
    cookLabels: {},
    slug: overrides.title.toLowerCase().replace(/\s+/g, "-"),
    category: "Mains",
    cuisine: null,
    addedBy: null,
    tags: [],
    prepMinutes: 10,
    cookMinutes: 20,
    cookLabel: "cook",
    waitMinutes: null,
    waitLabel: "chill",
    waitLabels: {},
    photo: null,
    draft: false,
    proteinPerServing: 10,
    kcalPerServing: 400,
    coverage: 1,
    haystack: overrides.title.toLowerCase(),
    ...overrides,
  };
}

describe("ordering", () => {
  it("sorts alphabetically", () => {
    const sorted = sortRecipes(
      [recipe({ title: "Zabaglione" }), recipe({ title: "Aioli" })],
      "alphabetical",
    );
    expect(sorted.map((r) => r.title)).toEqual(["Aioli", "Zabaglione"]);
  });

  /**
   * "Quickest" means total time to a cook: a recipe with 5 minutes of prep and
   * three hours in the oven is not quick.
   */
  it("sorts by total time, not prep alone", () => {
    const sorted = sortRecipes(
      [
        recipe({ title: "Slow", prepMinutes: 5, cookMinutes: 180 }),
        recipe({ title: "Fast", prepMinutes: 20, cookMinutes: 5 }),
      ],
      "prep-asc",
    );
    expect(sorted.map((r) => r.title)).toEqual(["Fast", "Slow"]);
  });

  it("reverses for longest first", () => {
    const sorted = sortRecipes(
      [
        recipe({ title: "Fast", prepMinutes: 5, cookMinutes: 5 }),
        recipe({ title: "Slow", prepMinutes: 5, cookMinutes: 180 }),
      ],
      "prep-desc",
    );
    expect(sorted.map((r) => r.title)).toEqual(["Slow", "Fast"]);
  });

  it("sorts by protein per serving, most first", () => {
    const sorted = sortRecipes(
      [
        recipe({ title: "Salad", proteinPerServing: 4 }),
        recipe({ title: "Steak", proteinPerServing: 42 }),
      ],
      "protein-desc",
    );
    expect(sorted.map((r) => r.title)).toEqual(["Steak", "Salad"]);
  });
});

describe("unknown values", () => {
  /**
   * The load-bearing rule, in both directions. A recipe with no time stated
   * must not lead "quickest first" *or* "longest first".
   */
  it.each<[SortKey, string]>([
    ["prep-asc", "quickest first"],
    ["prep-desc", "longest first"],
  ])("puts recipes with no time last in %s", (key) => {
    const sorted = sortRecipes(
      [
        recipe({ title: "Unknown", prepMinutes: null, cookMinutes: null }),
        recipe({ title: "Known", prepMinutes: 10, cookMinutes: 10 }),
      ],
      key,
    );
    expect(sorted[sorted.length - 1]?.title).toBe("Unknown");
  });

  it("puts recipes with no protein figure last, not first", () => {
    const sorted = sortRecipes(
      [
        recipe({ title: "Unresolved", proteinPerServing: null, coverage: 0 }),
        recipe({ title: "Lentils", proteinPerServing: 18 }),
        recipe({ title: "Lettuce", proteinPerServing: 1 }),
      ],
      "protein-desc",
    );
    expect(sorted.map((r) => r.title)).toEqual(["Lentils", "Lettuce", "Unresolved"]);
  });

  it("keeps a stable order among several unknowns", () => {
    const sorted = sortRecipes(
      [
        recipe({ title: "B", prepMinutes: null, cookMinutes: null }),
        recipe({ title: "A", prepMinutes: null, cookMinutes: null }),
      ],
      "prep-asc",
    );
    expect(sorted.map((r) => r.title)).toEqual(["A", "B"]);
  });
});

describe("a total order", () => {
  /**
   * Ties break on the title, so two recipes with the same prep time appear in
   * the same sequence on every render and in every build. Without it the order
   * is whatever the sort implementation happened to leave, which changes the
   * generated HTML between builds for no reason.
   */
  it("breaks ties by title", () => {
    const sorted = sortRecipes(
      [
        recipe({ title: "Cake", prepMinutes: 10, cookMinutes: 10 }),
        recipe({ title: "Bread", prepMinutes: 10, cookMinutes: 10 }),
        recipe({ title: "Ale", prepMinutes: 10, cookMinutes: 10 }),
      ],
      "prep-asc",
    );
    expect(sorted.map((r) => r.title)).toEqual(["Ale", "Bread", "Cake"]);
  });

  it("does not mutate its input", () => {
    const input = [recipe({ title: "B" }), recipe({ title: "A" })];
    sortRecipes(input, "alphabetical");
    expect(input.map((r) => r.title)).toEqual(["B", "A"]);
  });
});

describe("shelves", () => {
  const MIXED = [
    recipe({ title: "Pad Thai", category: "Mains", cuisine: "Thai" }),
    recipe({ title: "Som Tam", category: "Sides", cuisine: "Thai" }),
    recipe({ title: "Focaccia", category: "Baked Goods", cuisine: "Italian" }),
    recipe({ title: "Porridge", category: "Breakfast", cuisine: null }),
  ];

  it("groups by category, in the collection's own order", () => {
    const shelves = shelveRecipes(MIXED, "category", [
      "Mains",
      "Sides",
      "Breakfast",
      "Baked Goods",
    ]);
    expect(shelves.map((s) => s.name)).toEqual([
      "Mains",
      "Sides",
      "Breakfast",
      "Baked Goods",
    ]);
  });

  it("appends categories the collection does not order, alphabetically", () => {
    const shelves = shelveRecipes(MIXED, "category", ["Mains"]);
    expect(shelves[0]?.name).toBe("Mains");
    expect(shelves.slice(1).map((s) => s.name)).toEqual([
      "Baked Goods",
      "Breakfast",
      "Sides",
    ]);
  });

  it("groups by cuisine, alphabetically", () => {
    const shelves = shelveRecipes(MIXED, "cuisine");
    expect(shelves.map((s) => s.name)).toEqual(["Italian", "Thai", "Unattributed"]);
  });

  /**
   * A recipe with no cuisine still has to appear somewhere. Dropping it because
   * a field is blank would hide it from the page entirely.
   */
  it("keeps recipes with no cuisine, under a name of their own", () => {
    const shelves = shelveRecipes(MIXED, "cuisine");
    const unattributed = shelves.find((s) => s.name === "Unattributed");
    expect(unattributed?.recipes.map((r) => r.title)).toEqual(["Porridge"]);
  });

  it("returns one unlabelled shelf for the orderings", () => {
    for (const key of ["alphabetical", "prep-asc", "protein-desc"] as const) {
      const shelves = shelveRecipes(MIXED, key);
      expect(shelves).toHaveLength(1);
      expect(shelves[0]?.name).toBe("");
      expect(shelves[0]?.recipes).toHaveLength(MIXED.length);
    }
  });

  /** Every recipe appears exactly once, whichever arrangement is chosen. */
  it.each(SORT_KEYS)("loses no recipe when arranged by %s", (key: SortKey) => {
    const shelved = shelveRecipes(MIXED, key).flatMap((s) => s.recipes);
    expect(shelved).toHaveLength(MIXED.length);
    expect(new Set(shelved.map((r) => r.slug)).size).toBe(MIXED.length);
  });

  /**
   * Every arrangement has a label to offer, in every language. A key added to
   * SORT_KEYS without a row in SORT_STRING_KEYS would render as nothing at all
   * — an empty line in the menu, which looks like a bug in the menu.
   */
  it("names every arrangement it offers", () => {
    for (const key of SORT_KEYS) {
      expect(SORT_STRING_KEYS[key]).toBeTruthy();
    }
  });

  /**
   * Every arrangement must be reachable from the menu. A key that exists in
   * the type and in the string table but in no row is an arrangement the code
   * can be in and the reader can never choose — or, worse, can be left in with
   * no row lit to say so.
   */
  it("offers every arrangement in some row", () => {
    const reachable = new Set(
      SORT_ROWS.flatMap((row) =>
        row.reverse ? [row.primary, row.reverse] : [row.primary],
      ),
    );
    expect([...SORT_KEYS].filter((key) => !reachable.has(key))).toEqual([]);
  });

  it("handles an empty collection", () => {
    expect(shelveRecipes([], "category")).toEqual([]);
    expect(shelveRecipes([], "alphabetical")[0]?.recipes).toEqual([]);
  });
});

describe("toggling an ordering", () => {
  const time = SORT_ROWS.find((row) => row.primary === "prep-asc")!;
  const category = SORT_ROWS.find((row) => row.primary === "category")!;

  /**
   * Three clicks and you are back where you started. This is the whole reason
   * the two time rows became one: a reader who wants to undo "quickest first"
   * should not have to work out that the way back is a different row.
   */
  it("cycles primary, reverse, off", () => {
    expect(nextSort(time, "category")).toBe("prep-asc");
    expect(nextSort(time, "prep-asc")).toBe("prep-desc");
    expect(nextSort(time, "prep-desc")).toBe("category");
  });

  it("starts at the primary from any unrelated arrangement", () => {
    expect(nextSort(time, "alphabetical")).toBe("prep-asc");
    expect(nextSort(time, "protein-desc")).toBe("prep-asc");
  });

  it("does not toggle a grouping", () => {
    expect(nextSort(category, "category")).toBe("category");
    expect(nextSort(category, "prep-desc")).toBe("category");
  });
});

describe("filters", () => {
  const LISTING: RecipeSummary[] = [
    recipe({ title: "Larb", cuisine: "Thai", addedBy: "ada" }),
    recipe({ title: "Curry", cuisine: "Thai", addedBy: "bob" }),
    recipe({ title: "Loaf", cuisine: "British", addedBy: "ada" }),
    recipe({ title: "Orphan" }),
  ];

  it("narrows to one cuisine", () => {
    expect(
      filterRecipes(LISTING, { cuisine: "Thai", addedBy: null }).map((r) => r.title),
    ).toEqual(["Larb", "Curry"]);
  });

  it("narrows to one contributor", () => {
    expect(
      filterRecipes(LISTING, { cuisine: null, addedBy: "ada" }).map((r) => r.title),
    ).toEqual(["Larb", "Loaf"]);
  });

  it("combines the two", () => {
    expect(
      filterRecipes(LISTING, { cuisine: "Thai", addedBy: "ada" }).map((r) => r.title),
    ).toEqual(["Larb"]);
  });

  it("returns everything when nothing is set", () => {
    expect(filterRecipes(LISTING, { cuisine: null, addedBy: null })).toHaveLength(4);
  });

  /**
   * A recipe with no cuisine has to be reachable. Otherwise filtering is a way
   * to lose a recipe permanently: it is on no shelf you can select, and the
   * only way back to it is to clear the filter you may not remember setting.
   */
  it("gathers a missing value under one named option", () => {
    expect(filterOptions(LISTING, "cuisine")).toEqual([
      { value: "British", count: 1 },
      { value: "Thai", count: 2 },
      { value: UNATTRIBUTED_SHELF, count: 1 },
    ]);
    expect(
      filterRecipes(LISTING, { cuisine: UNATTRIBUTED_SHELF, addedBy: null }).map(
        (r) => r.title,
      ),
    ).toEqual(["Orphan"]);
  });

  it("counts contributors", () => {
    expect(filterOptions(LISTING, "addedBy")).toEqual([
      { value: "ada", count: 2 },
      { value: "bob", count: 1 },
      // Last, wherever the alphabet would have put it.
      { value: UNATTRIBUTED_SHELF, count: 1 },
    ]);
  });
});

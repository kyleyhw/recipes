import { describe, expect, it } from "vitest";
import { loadCollection } from "@/lib/content/library";

/**
 * Tests for loading the collection off disk.
 *
 * These run against the **real** `content/` directory rather than a fixture,
 * deliberately. The failure this guards against is a recipe file that is
 * committed but unreadable — and a fixture cannot catch that, because the
 * fixture is not what ships. If someone hand-edits a recipe and breaks its
 * front matter, this test fails in CI before the site deploys with a recipe
 * missing.
 */

describe("the committed collection", () => {
  const collection = loadCollection();

  /**
   * The important one. Every file in `content/recipes` must parse; a problem
   * here names the file and the reason, which is what a person needs to fix it.
   */
  it("has no unreadable files", () => {
    expect(collection.problems).toEqual([]);
  });

  it("loads at least one recipe", () => {
    expect(collection.recipes.length).toBeGreaterThan(0);
  });

  it("loads the ingredient library and the categories", () => {
    expect(collection.ingredients.length).toBeGreaterThan(0);
    expect(collection.categories.length).toBeGreaterThan(0);
  });

  /**
   * Every recipe's category must exist, or it appears on no shelf and is
   * reachable only by its direct URL — invisible in exactly the way a lost
   * recipe is.
   */
  it("gives every recipe a category that exists", () => {
    const known = new Set(collection.categories.map((category) => category.name));
    const orphans = collection.recipes
      .filter((recipe) => !known.has(recipe.category))
      .map((recipe) => `${recipe.slug} -> ${recipe.category}`);
    expect(orphans).toEqual([]);
  });

  it("gives every recipe a positive serving count and at least one step", () => {
    for (const recipe of collection.recipes) {
      expect(recipe.servings).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(0);
      expect(recipe.ingredients.length).toBeGreaterThan(0);
    }
  });

  /**
   * The build generates one page per slug, so a duplicate would silently
   * overwrite a recipe with another.
   */
  it("has no duplicate slugs", () => {
    const slugs = collection.recipes.map((recipe) => recipe.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  /**
   * Deterministic ordering, so two builds of one commit produce identical HTML
   * and a deploy diff means something.
   */
  it("returns recipes in a stable order", () => {
    const titles = collection.recipes.map((recipe) => recipe.title);
    expect([...titles].sort((a, b) => a.localeCompare(b))).toEqual(titles);
  });
});

describe("the ingredient library", () => {
  const { ingredients } = loadCollection();

  it("has no duplicate names", () => {
    const names = ingredients.map((ingredient) => ingredient.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * Every figure in the library is a magic number and must be traceable to
   * where it came from — the same standard the database column enforced.
   */
  it("records where every ingredient's figures came from", () => {
    const untraceable = ingredients
      .filter((ingredient) => !ingredient.sourceNote && !ingredient.usdaFdcId)
      .map((ingredient) => ingredient.name);
    expect(untraceable).toEqual([]);
  });

  it("has no negative or non-finite macro figures", () => {
    for (const ingredient of ingredients) {
      for (const value of [
        ingredient.kcal100g,
        ingredient.protein100g,
        ingredient.carbs100g,
        ingredient.fat100g,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

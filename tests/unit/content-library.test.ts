import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCollection } from "@/lib/content/library";
import { parseRecipeFile, serialiseRecipeFile } from "@/lib/content/format";
import { matchIngredient } from "@/lib/content/prepare";
import { parseIngredientLine } from "@/lib/ingredient-parser";

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

describe("every recipe resolves against the library", () => {
  const { recipes, ingredients } = loadCollection();

  /**
   * The failure this catches is silent in every other way.
   *
   * An ingredient line that matches nothing contributes no nutrition — which is
   * the documented behaviour, and is meant to show up as a coverage gap on the
   * page. But coverage is a fraction of *determinable* mass, so a line whose
   * mass cannot be worked out without the library (anything by the spoon, or by
   * the item) drops out of the numerator and the denominator together, and the
   * recipe still reports 100%. Nothing on the page says a word.
   *
   * It happened with `1 spring onion` against a library row named
   * `spring onions`: the singular matched nothing, the nutrition quietly lost
   * it, the diagram leaf lost its quantity, and the panel said 100% covered.
   */
  it("matches every ingredient line to a library entry", () => {
    const unmatched = recipes.flatMap((recipe) =>
      recipe.ingredients
        .filter((line) => !matchIngredient(parseIngredientLine(line).name, ingredients))
        .map((line) => `${recipe.slug}: ${line}`),
    );
    expect(unmatched).toEqual([]);
  });

  /**
   * And the other direction: no row in the library that no recipe uses.
   *
   * The two tests together make the library exactly the set of things this
   * collection cooks with. That matters because every row is a claim — a
   * sourced figure someone has to keep true — and a row nothing uses is a claim
   * nobody will ever check, sitting on the ingredients page next to the ones
   * that are checked every time a recipe is built.
   *
   * It is also the honest reading of what the library is *for*. It is not a
   * food database; USDA is the food database. It is the subset of it these
   * recipes need, and anything beyond that subset is drift.
   *
   * The fix when this fails is not to delete the row reflexively — a row added
   * alongside a recipe that has not been committed yet fails here too. Commit
   * the recipe, or drop the row.
   */
  it("keeps no ingredient the collection does not use", () => {
    const used = new Set(
      recipes.flatMap((recipe) =>
        recipe.ingredients.flatMap((line) => {
          const match = matchIngredient(parseIngredientLine(line).name, ingredients);
          return match ? [match.name] : [];
        }),
      ),
    );
    const unused = ingredients
      .map((ingredient) => ingredient.name)
      .filter((name) => !used.has(name));
    expect(unused).toEqual([]);
  });
});

/**
 * Round-tripping the *shipped* files, not a fixture.
 *
 * `content-format.test.ts` already checks that parse-then-serialise is
 * byte-stable, against a recipe it builds itself. That fixture had a short
 * description, and the YAML writer only folds lines past eighty columns — so
 * the test passed while forty-five of forty-seven real recipes did not
 * round-trip, every one of them because its description was long enough to
 * wrap.
 *
 * Nothing was visibly broken, because nothing rewrote a recipe file. The moment
 * something did — `scripts/photos.ts`, adding a photo to the front matter —
 * touching one recipe would have reflowed the front matter of every recipe it
 * touched, burying a one-line change in a diff nobody could read.
 *
 * The lesson is the one this collection keeps relearning: a test against a
 * fixture proves the fixture works. This runs against what ships.
 */
describe("every committed recipe round-trips", () => {
  const dir = join("content", "recipes");

  it("re-serialises byte-for-byte", () => {
    const files = readdirSync(dir).filter(
      // English originals only: a translation file is a different shape.
      (name) => name.endsWith(".md") && name.split(".").length === 2,
    );
    expect(files.length).toBeGreaterThan(0);

    const changed = files.filter((name) => {
      const raw = readFileSync(join(dir, name), "utf8");
      const parsed = parseRecipeFile(name.replace(/\.md$/, ""), raw);
      return parsed.ok && serialiseRecipeFile(parsed.recipe) !== raw;
    });
    expect(changed).toEqual([]);
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

  /**
   * A `keeping` note is optional, but a stub is worse than nothing: it takes up
   * the space where the real answer would go and reads as though the question
   * has been answered. Forty characters is roughly "Two days in the fridge, or
   * freeze it flat for 3 months" — a place, a time, and a method.
   */
  it("keeps no stub storage notes", () => {
    const stubs = ingredients
      .filter((ingredient) => ingredient.keeping && ingredient.keeping.trim().length < 40)
      .map((ingredient) => ingredient.name);
    expect(stubs).toEqual([]);
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

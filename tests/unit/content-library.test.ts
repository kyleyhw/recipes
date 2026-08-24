import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCollection } from "@/lib/content/library";
import { usedInIndex } from "@/lib/content/prepare";
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

/**
 * The two derived figures a recipe line now shows: the count in brackets after
 * a weight, and the packet note under a volume.
 *
 * Both are computed from the library rather than written into the recipe, which
 * is what keeps them right when the stepper moves — and which is also why a
 * half-filled row is dangerous. A `unitName` with no mu produces a noun with no
 * number behind it; a `madeUp` with no rho produces a packet count for a volume
 * that cannot be weighed. Neither would throw. Both would be silently absent
 * from the page, which is the failure this collection is worst at noticing.
 */
describe("the countable units", () => {
  const { ingredients } = loadCollection();

  it("names a unit only where there is a mass for one of them", () => {
    const orphaned = ingredients
      .filter((ingredient) => ingredient.unitName && !ingredient.gramsPerUnit)
      .map((ingredient) => ingredient.name);
    expect(orphaned).toEqual([]);
  });

  it("gives an explicit plural only alongside the singular it replaces", () => {
    const orphaned = ingredients
      .filter((ingredient) => ingredient.unitNamePlural && !ingredient.unitName)
      .map((ingredient) => ingredient.name);
    expect(orphaned).toEqual([]);
  });

  /**
   * A packet count is derived from a volume, and a volume is only a volume if
   * the row carries a density. Without one the line is measured in millilitres
   * that resolve to nothing and the note never appears.
   */
  it("reconstitutes only liquids that have a density", () => {
    for (const ingredient of ingredients) {
      if (!ingredient.madeUp) continue;
      expect(ingredient.densityGPerMl, ingredient.name).toBeTruthy();
      expect(ingredient.madeUp.perMl, ingredient.name).toBeGreaterThan(0);
    }
  });

  /**
   * The number in brackets has to be plausible against the weight beside it.
   * A mu that is out by a factor — udon recorded at 150 g a portion when the
   * pack is 200 g — shows up as a fractional count on a whole-pack recipe, and
   * that is exactly how the udon figure was caught. This is the general form:
   * no ingredient may be so heavy per item that a recipe using it by weight
   * could not contain even a quarter of one.
   */
  it("has no per-item mass a recipe could not reach", () => {
    const tooHeavy = ingredients
      .filter((ingredient) => (ingredient.gramsPerUnit ?? 0) > 2000)
      .map((ingredient) => ingredient.name);
    expect(tooHeavy).toEqual([]);
  });
});

describe("what uses each ingredient", () => {
  const { recipes, ingredients } = loadCollection();
  const index = usedInIndex(recipes, ingredients);

  it("has an entry for every ingredient in the library", () => {
    expect(Object.keys(index).sort()).toEqual(
      ingredients.map((ingredient) => ingredient.name).sort(),
    );
  });

  /**
   * The same claim the library's own pruning rule makes, from the other side.
   * If an ingredient is in the library, something uses it — so no list here is
   * empty, and the expandable section on the ingredients page never opens onto
   * nothing.
   */
  it("finds at least one recipe for every ingredient", () => {
    const unused = Object.entries(index)
      .filter(([, uses]) => uses.length === 0)
      .map(([name]) => name);
    expect(unused).toEqual([]);
  });

  /** An ingredient listed twice in one recipe is that recipe once. */
  it("counts a recipe once however many lines mention the ingredient", () => {
    for (const uses of Object.values(index)) {
      expect(new Set(uses.map((use) => use.slug)).size).toBe(uses.length);
    }
  });

  it("agrees with the recipes about how many use a given ingredient", () => {
    const garlic = index["garlic"] ?? [];
    const counted = recipes.filter((recipe) =>
      recipe.ingredients.some((line) => /\bgarlic\b/.test(line) && !/powder/.test(line)),
    );
    expect(garlic.length).toBe(counted.length);
  });
});

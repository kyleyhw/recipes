import { describe, expect, it } from "vitest";
import {
  BUNDLE_VERSION,
  bundleFilename,
  migrateBundle,
  parseBundle,
  parseCollection,
  type Bundle,
} from "@/lib/sharing/bundle";

/**
 * Tests for the portable bundle format (docs/sharing-format.md).
 *
 * Instances are independent deployments, so a bundle is a contract between two
 * pieces of software that may be at different versions and may never
 * communicate again. The tests are therefore about *compatibility* as much as
 * correctness: what happens to a bundle written by an older instance, by a
 * newer one, or by something that is not this application at all.
 */

function validBundle(): Bundle {
  return {
    schema: "recipes.bundle",
    version: BUNDLE_VERSION,
    exportedAt: "2026-08-10T12:00:00.000Z",
    instanceUrl: "https://their-recipes.example.com",
    shareId: "abc123",
    recipe: {
      title: "Dal Tarka",
      description: "Sharp and hot.",
      categoryName: "Mains",
      tagNames: ["quick", "vegan"],
      baseServings: 4,
      servingLabel: "serving",
      prepMinutes: 10,
      cookMinutes: 30,
      sourceUrl: null,
      notes: null,
      photoUrl: null,
      photoCredit: null,
      ingredients: [
        {
          rawText: "200 g red lentils",
          quantity: 200,
          unit: "g",
          name: "red lentils",
          prepNote: null,
          optional: false,
          scalable: true,
          gramsOverride: null,
          ingredientName: "dried lentils",
          macro: {
            kcal100g: 353,
            protein100g: 25.8,
            carbs100g: 60.08,
            fat100g: 1.06,
            fiber100g: 30.5,
            sugar100g: 2.03,
            sodiumMg100g: 6,
            densityGPerMl: 0.8,
            gramsPerUnit: null,
            usdaFdcId: "172420",
            sourceNote: "USDA SR Legacy 172420",
          },
        },
      ],
      steps: ["Simmer the lentils.", "Pour over the tempered spices."],
    },
  };
}

describe("round-trip", () => {
  it("survives serialisation and parsing unchanged", () => {
    const original = validBundle();
    const parsed = parseBundle(JSON.parse(JSON.stringify(original)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.bundle).toEqual(original);
  });

  /**
   * The load-bearing property of the format. Carrying resolved macros is what
   * lets the importing instance show correct nutrition with no USDA key, no
   * network call, and no model call — and what stops two instances computing
   * different numbers for the same recipe.
   */
  it("preserves the resolved macro snapshot and USDA identifier", () => {
    const parsed = parseBundle(JSON.parse(JSON.stringify(validBundle())));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ingredient = parsed.bundle.recipe.ingredients[0];
    expect(ingredient?.macro?.kcal100g).toBe(353);
    expect(ingredient?.macro?.usdaFdcId).toBe("172420");
    // rho travels too, or a cup measure would be unconvertible on the far side.
    expect(ingredient?.macro?.densityGPerMl).toBe(0.8);
  });

  it("carries categories and tags as names, not identifiers", () => {
    // Identifiers are meaningless across a boundary: the receiving instance's
    // ids are its own.
    const parsed = parseBundle(JSON.parse(JSON.stringify(validBundle())));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bundle.recipe.categoryName).toBe("Mains");
      expect(parsed.bundle.recipe.tagNames).toEqual(["quick", "vegan"]);
    }
  });
});

describe("version compatibility", () => {
  /**
   * A bundle downloaded today must still import after the application has moved
   * on, or the file-download path is useless as a backup.
   */
  it("migrates an older bundle to the current version", () => {
    const old = { ...validBundle(), version: 1 };
    const parsed = parseBundle(migrateBundle(old));
    expect(parsed.ok).toBe(true);
  });

  /**
   * A bundle from a *newer* instance carries fields this version does not know
   * about. Ignoring them is better than refusing an import we could largely
   * honour.
   */
  it("accepts a newer bundle, ignoring fields it does not understand", () => {
    const future = {
      ...validBundle(),
      version: 99,
      somethingNew: { added: "in a later version" },
    };
    const parsed = parseBundle(future);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.bundle.recipe.title).toBe("Dal Tarka");
  });

  it("leaves a current-version bundle untouched by migration", () => {
    const current = validBundle();
    expect(migrateBundle(current)).toEqual(current);
  });
});

describe("rejection", () => {
  /**
   * Malformed input is routine — a truncated download, a pasted fragment, the
   * wrong file entirely — so it must produce an actionable message rather than
   * an error page, and must never throw.
   */
  it.each([
    ["null", null],
    ["a string", "not a bundle"],
    ["a number", 42],
    ["an empty object", {}],
    ["an array", []],
    ["the wrong schema marker", { ...validBundle(), schema: "something.else" }],
  ])("rejects %s with a message rather than throwing", (_label, input) => {
    let result: ReturnType<typeof parseBundle> | undefined;
    expect(() => {
      result = parseBundle(input);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("rejects a bundle whose recipe is structurally wrong", () => {
    const broken = validBundle() as unknown as Record<string, unknown>;
    broken["recipe"] = { title: "Only a title" };
    const result = parseBundle(broken);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive serving count", () => {
    // baseServings is the denominator of the scaling factor; zero would make
    // every scaled quantity infinite.
    const broken = validBundle();
    broken.recipe.baseServings = 0;
    expect(parseBundle(broken).ok).toBe(false);
  });

  it("names the offending field in its message", () => {
    const broken = validBundle();
    broken.recipe.baseServings = 0;
    const result = parseBundle(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("baseServings");
  });
});

describe("collections", () => {
  it("parses a whole-collection export", () => {
    const result = parseCollection({
      schema: "recipes.collection",
      version: BUNDLE_VERSION,
      exportedAt: "2026-08-10T12:00:00.000Z",
      instanceUrl: null,
      recipes: [validBundle(), validBundle()],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.collection.recipes).toHaveLength(2);
  });

  it("does not mistake a single bundle for a collection", () => {
    // Both arrive through the same file control, so the two shapes must be
    // distinguishable without guessing.
    expect(parseCollection(validBundle()).ok).toBe(false);
    expect(
      parseBundle({
        schema: "recipes.collection",
        version: 1,
        exportedAt: "",
        instanceUrl: null,
        recipes: [],
      }).ok,
    ).toBe(false);
  });
});

describe("filenames", () => {
  it.each([
    ["Dal Tarka", "dal-tarka.recipe.json"],
    ["Crème Brûlée", "cr-me-br-l-e.recipe.json"],
    ["!!!", "recipe.recipe.json"],
  ])("derives a safe filename from %s", (title, expected) => {
    expect(bundleFilename(title)).toBe(expected);
  });

  it("truncates a very long title", () => {
    expect(bundleFilename("x".repeat(500)).length).toBeLessThan(80);
  });
});

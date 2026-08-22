import { describe, expect, it } from "vitest";
import {
  parseRecipeFile,
  recipeFilename,
  serialiseRecipeFile,
  type RecipeFile,
} from "@/lib/content/format";

/**
 * Tests for the on-disk recipe format.
 *
 * This module matters more than any other in the application, because the file
 * *is* the recipe — there is no database holding a second copy. A bug here does
 * not degrade a feature; it corrupts the only copy of something that cannot be
 * reconstructed.
 *
 * Three properties are tested accordingly:
 *
 *  - **Round-trip stability.** Parsing and re-serialising an unchanged recipe
 *    must produce a byte-identical file, or every save shows as a diff and the
 *    git history — the entire reason for the format — becomes noise.
 *  - **Nothing is silently dropped**, including from malformed input.
 *  - **A hand-edited file that is wrong produces a message**, not a crash.
 *    People will edit these by hand; that is the point of the format.
 */

function recipe(overrides: Partial<RecipeFile> = {}): RecipeFile {
  return {
    translations: {},
    diagram: [],
    slug: "butter-loaf",
    title: "Butter Loaf",
    description: "Rich and close-crumbed.",
    category: "Baked Goods",
    cuisine: null,
    tags: ["quick"],
    servings: 8,
    servingLabel: "slice",
    prepMinutes: 20,
    cookMinutes: 40,
    waitMinutes: null,
    waitLabel: "chill",
    cookLabel: "cook",
    source: "https://www.bbcgoodfood.com/recipes/butter-loaf",
    photo: null,
    photoCredit: null,
    photoPrompt: null,
    draft: false,
    tin: null,
    ingredients: ["220 g butter", "300 g plain flour", "2 eggs"],
    steps: ["Cream the butter for 4 minutes, until pale.", "Fold in the flour."],
    notes: "Keeps three days wrapped.",
    storage: "Four days in a tin. Freezes three months, sliced.",
    log: [{ date: "2026-08-11", text: "Dry at 180 g butter; raised it." }],
    ...overrides,
  };
}

describe("round trip", () => {
  /**
   * The load-bearing property. If serialising a parsed file is not the identity,
   * saving a recipe you did not change still commits a diff.
   */
  it("is byte-identical through serialise → parse → serialise", () => {
    const first = serialiseRecipeFile(recipe());
    const parsed = parseRecipeFile("butter-loaf", first);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serialiseRecipeFile(parsed.recipe)).toBe(first);
  });

  it("preserves every field", () => {
    const original = recipe();
    const parsed = parseRecipeFile("butter-loaf", serialiseRecipeFile(original));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe).toEqual(original);
  });

  it.each([
    ["no description", { description: null }],
    ["no tags", { tags: [] }],
    ["no timings", { prepMinutes: null, cookMinutes: null }],
    ["no source", { source: null }],
    ["no notes", { notes: null }],
    ["no storage", { storage: null }],
    ["a cuisine", { cuisine: "Thai" }],
    ["no log", { log: [] }],
    ["a draft", { draft: true }],
    ["a baking tin", { tin: { shape: "round" as const, diameter: 20, depth: 7 } }],
    ["a loaf tin", { tin: { shape: "loaf" as const, length: 23, width: 13 } }],
    ["a chilled dish", { cookLabel: "chill" }],
    [
      "a photo with credit",
      {
        photo: "/photos/butter-loaf.webp",
        photoCredit: { siteName: "bbcgoodfood.com", pageUrl: "https://example.com/p" },
      },
    ],
  ])("round-trips %s", (_label, overrides) => {
    const original = recipe(overrides as Partial<RecipeFile>);
    const parsed = parseRecipeFile("butter-loaf", serialiseRecipeFile(original));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe).toEqual(original);
  });

  /**
   * Empty fields are omitted rather than written as `null`, so a minimal recipe
   * produces a minimal file. A file full of `null`s reads as broken.
   */
  it("omits absent fields from the front matter", () => {
    const text = serialiseRecipeFile(
      recipe({ description: null, source: null, tags: [], prepMinutes: null }),
    );
    expect(text).not.toContain("description");
    expect(text).not.toContain("source");
    expect(text).not.toContain("tags");
    expect(text).not.toContain("prepMinutes");
  });
});

describe("the file is readable as a document", () => {
  /**
   * The format's other purpose: a recipe file should render as a recipe on
   * GitHub, with no tooling. That means real Markdown headings and lists.
   */
  it("writes ingredients as a bullet list and steps as a numbered one", () => {
    const text = serialiseRecipeFile(recipe());
    expect(text).toContain("## Ingredients");
    expect(text).toContain("- 220 g butter");
    expect(text).toContain("## Method");
    expect(text).toContain("1. Cream the butter for 4 minutes, until pale.");
    expect(text).toContain("2. Fold in the flour.");
  });

  /**
   * The argument for the whole format: changing one quantity changes one line.
   */
  it("puts one ingredient on one line, so a diff is one line", () => {
    const before = serialiseRecipeFile(
      recipe({ ingredients: ["180 g butter", "2 eggs"] }),
    );
    const after = serialiseRecipeFile(
      recipe({ ingredients: ["220 g butter", "2 eggs"] }),
    );
    const changed = after.split("\n").filter((line, i) => line !== before.split("\n")[i]);
    expect(changed).toEqual(["- 220 g butter"]);
  });
});

describe("reading hand-written files", () => {
  it("accepts a minimal file", () => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "",
        "## Ingredients",
        "",
        "- 2 slices bread",
        "",
        "## Method",
        "",
        "1. Toast the bread.",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe.title).toBe("Toast");
    expect(parsed.recipe.ingredients).toEqual(["2 slices bread"]);
    expect(parsed.recipe.servingLabel).toBe("serving");
    expect(parsed.recipe.tags).toEqual([]);
  });

  it.each([
    ["asterisk bullets", "* 2 slices bread"],
    ["plus bullets", "+ 2 slices bread"],
    ["dash bullets", "- 2 slices bread"],
    ["numbered", "1. 2 slices bread"],
  ])("accepts %s in the ingredient list", (_label, line) => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "## Ingredients",
        line,
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe.ingredients).toEqual(["2 slices bread"]);
  });

  it("matches headings case-insensitively", () => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "## INGREDIENTS",
        "- bread",
        "## method",
        "1. Toast it.",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.recipe.ingredients).toEqual(["bread"]);
      expect(parsed.recipe.steps).toEqual(["Toast it."]);
    }
  });

  /**
   * A stray paragraph above the first heading is far more likely to be a note
   * the writer left themselves than an unlabelled ingredient. Promoting it
   * silently would put it in the shopping list.
   */
  it("ignores text before the first recognised heading", () => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "I make this every morning.",
        "",
        "## Ingredients",
        "- bread",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe.ingredients).toEqual(["bread"]);
  });

  it("ends a section at an unrecognised heading rather than swallowing it", () => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "## Ingredients",
        "- bread",
        "## Shopping",
        "- go to the shop",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe.ingredients).toEqual(["bread"]);
  });
});

describe("what the cooking time is called", () => {
  const base = ["---", "title: X", "category: Desserts", "servings: 4"];

  /**
   * "60 min cook" is wrong for a loaf, a terrine and a sorbet alike — they are
   * baked, chilled and frozen. The word says whether you have to be in the
   * kitchen for it, which is most of what the number is for.
   */
  it("defaults to cook", () => {
    const parsed = parseRecipeFile("x", [...base, "---"].join("\n"));
    expect(parsed.ok && parsed.recipe.cookLabel).toBe("cook");
  });

  /**
   * A tin is a stronger signal than the category, which someone can file
   * anywhere: if it goes in a tin, it is baked.
   */
  it("infers bake from the presence of a tin", () => {
    const parsed = parseRecipeFile(
      "x",
      [...base, "tin:", "  shape: round", "  diameter: 20", "---"].join("\n"),
    );
    expect(parsed.ok && parsed.recipe.cookLabel).toBe("bake");
  });

  it("lets the recipe say so explicitly, overriding the inference", () => {
    const parsed = parseRecipeFile(
      "x",
      [
        ...base,
        "cookLabel: chill",
        "tin:",
        "  shape: round",
        "  diameter: 20",
        "---",
      ].join("\n"),
    );
    expect(parsed.ok && parsed.recipe.cookLabel).toBe("chill");
  });

  it.each(["freeze", "prove", "marinate", "rest"])("accepts %s", (label) => {
    const parsed = parseRecipeFile(
      "x",
      [...base, `cookLabel: ${label}`, "---"].join("\n"),
    );
    expect(parsed.ok && parsed.recipe.cookLabel).toBe(label);
  });

  /**
   * An inferred label is not written back into the file: a recipe with a tin
   * does not gain a redundant `cookLabel: bake` line just for having been
   * opened and saved.
   */
  it("omits the label when it is what would be inferred anyway", () => {
    const withTin = serialiseRecipeFile(
      recipe({ tin: { shape: "round", diameter: 20 }, cookLabel: "bake" }),
    );
    expect(withTin).not.toContain("cookLabel");

    const noTin = serialiseRecipeFile(recipe({ tin: null, cookLabel: "cook" }));
    expect(noTin).not.toContain("cookLabel");
  });

  it("writes the label when it differs from the inference", () => {
    const text = serialiseRecipeFile(recipe({ tin: null, cookLabel: "freeze" }));
    expect(text).toContain("cookLabel: freeze");
  });
});

describe("the log", () => {
  it("reads dated lines", () => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "## Log",
        "- 2026-08-11: Needed more butter.",
        "- 2026-08-12: Better.",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.recipe.log).toEqual([
        { date: "2026-08-11", text: "Needed more butter." },
        { date: "2026-08-12", text: "Better." },
      ]);
    }
  });

  /**
   * A mistyped date must not cost someone their note. What they wrote is the
   * part that cannot be reconstructed; the date is not.
   */
  it("keeps an undated line rather than dropping it", () => {
    const parsed = parseRecipeFile(
      "toast",
      [
        "---",
        "title: Toast",
        "category: Breakfast",
        "servings: 1",
        "---",
        "## Log",
        "- forgot to write the date",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.recipe.log).toEqual([{ date: "", text: "forgot to write the date" }]);
    }
  });
});

describe("rejecting broken files", () => {
  it.each([
    ["no front matter", "## Ingredients\n- bread"],
    ["unterminated front matter", "---\ntitle: Toast\n## Ingredients"],
    ["front matter that is not a mapping", "---\n- a\n- b\n---\n"],
    ["a missing title", "---\ncategory: Breakfast\nservings: 1\n---\n"],
    ["a missing category", "---\ntitle: Toast\nservings: 1\n---\n"],
    [
      "a zero serving count",
      "---\ntitle: Toast\ncategory: Breakfast\nservings: 0\n---\n",
    ],
    ["invalid YAML", "---\ntitle: [unclosed\n---\n"],
  ])("reports %s with a message rather than throwing", (_label, raw) => {
    let result: ReturnType<typeof parseRecipeFile> | undefined;
    expect(() => {
      result = parseRecipeFile("toast", raw);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("names the offending field", () => {
    const result = parseRecipeFile(
      "toast",
      "---\ntitle: Toast\ncategory: X\nservings: 0\n---\n",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("servings");
  });

  /**
   * A colon in a title is the most likely way a hand-written file breaks YAML,
   * and the writer of the file did nothing wrong — so the serialiser must quote
   * it and the parser must read it back.
   */
  it("survives a colon in the title", () => {
    const text = serialiseRecipeFile(recipe({ title: "Dal: the good one" }));
    const parsed = parseRecipeFile("dal", text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe.title).toBe("Dal: the good one");
  });

  it("survives quotes and apostrophes in prose", () => {
    const text = serialiseRecipeFile(
      recipe({ description: `He said "use butter", she didn't` }),
    );
    const parsed = parseRecipeFile("x", text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.recipe.description).toBe(`He said "use butter", she didn't`);
    }
  });
});

describe("filenames", () => {
  it("puts recipes in one directory, named by slug", () => {
    expect(recipeFilename("butter-loaf")).toBe("content/recipes/butter-loaf.md");
  });
});

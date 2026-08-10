import { describe, expect, it } from "vitest";
import { extractRecipeFromHtml, parseIsoDuration } from "@/lib/import/jsonld";

/**
 * Tests for schema.org recipe extraction.
 *
 * The fixtures reproduce the envelope shapes that real recipe sites actually
 * emit, because that variation is the whole difficulty: the specification
 * permits a field to be a string, an object, or an array of either, and sites
 * exercise all three. A parser tested only against the tidy case fails on most
 * of the web.
 */

function page(jsonLd: string, head = ""): string {
  return `<!doctype html><html><head>${head}
    <script type="application/ld+json">${jsonLd}</script>
  </head><body></body></html>`;
}

const TIDY = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Lemon Cake",
  description: "A plain lemon cake.",
  recipeIngredient: ["200 g flour", "2 eggs", "1 lemon"],
  recipeInstructions: ["Mix.", "Bake."],
  recipeYield: "8 servings",
  prepTime: "PT20M",
  cookTime: "PT1H10M",
  image: "https://example.com/cake.jpg",
  url: "https://example.com/lemon-cake",
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT30M", 30],
    ["PT1H", 60],
    ["PT1H30M", 90],
    ["PT2H15M", 135],
    ["P1DT2H", 1560],
  ])("parses %s as %i minutes", (input, expected) => {
    expect(parseIsoDuration(input)).toBe(expected);
  });

  it.each([
    ["", null],
    ["nonsense", null],
    ["PT0M", null],
    [undefined, null],
    [42, null],
  ])("returns null for %s", (input, expected) => {
    expect(parseIsoDuration(input)).toBe(expected);
  });
});

describe("extraction", () => {
  it("reads a well-formed Recipe node", () => {
    const result = extractRecipeFromHtml(page(TIDY));
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Lemon Cake");
    expect(result?.ingredientsText.split("\n")).toHaveLength(3);
    expect(result?.stepsText).toBe("Mix.\nBake.");
    expect(result?.servings).toBe(8);
    expect(result?.prepMinutes).toBe(20);
    expect(result?.cookMinutes).toBe(70);
  });

  /**
   * `@graph` envelopes are extremely common — most WordPress recipe plugins
   * emit one, with the Recipe buried among Organization and WebPage nodes.
   */
  it("finds a Recipe inside an @graph alongside unrelated nodes", () => {
    const html = page(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Some Site" },
          { "@type": "BreadcrumbList", itemListElement: [] },
          JSON.parse(TIDY),
        ],
      }),
    );
    expect(extractRecipeFromHtml(html)?.title).toBe("Lemon Cake");
  });

  it("finds a Recipe when @type is an array", () => {
    const html = page(
      JSON.stringify({ ...JSON.parse(TIDY), "@type": ["Recipe", "NewsArticle"] }),
    );
    expect(extractRecipeFromHtml(html)?.title).toBe("Lemon Cake");
  });

  it("flattens HowToSection nesting in the instructions", () => {
    const html = page(
      JSON.stringify({
        ...JSON.parse(TIDY),
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "For the cake",
            itemListElement: [
              { "@type": "HowToStep", text: "Cream the butter." },
              { "@type": "HowToStep", text: "Fold in the flour." },
            ],
          },
          { "@type": "HowToStep", text: "Bake for an hour." },
        ],
      }),
    );
    expect(extractRecipeFromHtml(html)?.stepsText).toBe(
      "Cream the butter.\nFold in the flour.\nBake for an hour.",
    );
  });

  it("strips HTML when instructions arrive as one markup blob", () => {
    const html = page(
      JSON.stringify({
        ...JSON.parse(TIDY),
        recipeInstructions: "<ol><li>Mix well.</li>\n<li>Bake.</li></ol>",
      }),
    );
    const steps = extractRecipeFromHtml(html)?.stepsText ?? "";
    expect(steps).not.toContain("<li>");
    expect(steps).toContain("Mix well.");
  });

  it("prefers og:image over the schema.org image", () => {
    // og:image is the image the site itself chose to represent the page, and is
    // reliably a single URL rather than an ImageObject array.
    const html = page(
      TIDY,
      '<meta property="og:image" content="https://example.com/og.jpg">',
    );
    expect(extractRecipeFromHtml(html)?.imageUrl).toBe("https://example.com/og.jpg");
  });

  it("falls back to the schema.org image, unwrapping an ImageObject", () => {
    const html = page(
      JSON.stringify({
        ...JSON.parse(TIDY),
        image: { "@type": "ImageObject", url: "https://example.com/obj.jpg" },
      }),
    );
    expect(extractRecipeFromHtml(html)?.imageUrl).toBe("https://example.com/obj.jpg");
  });

  it("extracts the yield from an array or a bare number", () => {
    for (const value of [["4"], 4, "Serves 4", ["4 servings", "4"]]) {
      const html = page(JSON.stringify({ ...JSON.parse(TIDY), recipeYield: value }));
      expect(extractRecipeFromHtml(html)?.servings).toBe(4);
    }
  });
});

describe("failure handling", () => {
  it("returns null when the page has no structured data", () => {
    // This is the signal for the caller to fall back to Claude, so it must be
    // null rather than an empty recipe.
    expect(extractRecipeFromHtml("<html><body>Just prose.</body></html>")).toBeNull();
  });

  it("returns null when the only structured data is not a Recipe", () => {
    const html = page(JSON.stringify({ "@type": "Article", name: "Not a recipe" }));
    expect(extractRecipeFromHtml(html)).toBeNull();
  });

  /**
   * A page often carries several JSON-LD blocks and only one is malformed.
   * Aborting the scan on the first parse error would lose recipes that are
   * present and valid.
   */
  it("skips a malformed block and keeps scanning", () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{ this is not json </script>
      <script type="application/ld+json">${TIDY}</script>
    </head><body></body></html>`;
    expect(extractRecipeFromHtml(html)?.title).toBe("Lemon Cake");
  });

  it("returns null rather than throwing when the Recipe has no name", () => {
    const html = page(JSON.stringify({ "@type": "Recipe", recipeIngredient: ["salt"] }));
    expect(extractRecipeFromHtml(html)).toBeNull();
  });

  it("does not recurse unboundedly on a deeply nested document", () => {
    // Guards the depth limit: a pathological document must terminate rather
    // than exhausting the stack.
    let nested: Record<string, unknown> = { "@type": "Recipe", name: "Deep" };
    for (let i = 0; i < 200; i += 1) nested = { wrapper: nested };
    expect(() => extractRecipeFromHtml(page(JSON.stringify(nested)))).not.toThrow();
  });
});

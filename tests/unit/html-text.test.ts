import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/import/html-text";

/**
 * Tests for the HTML reduction that feeds Claude's text extraction.
 *
 * Two properties matter, and only two. First, that nothing which is not
 * document text survives — script and style contents are the bulk of a modern
 * recipe page and would be charged for as input tokens. Second, that the
 * *structure* of a list survives as line breaks, because an ingredient list
 * flattened onto one line is materially harder to read back as a list.
 *
 * Fidelity beyond that is explicitly not a goal, which is why there are no
 * tests asserting exact whitespace: the consumer is a language model.
 */

describe("removal", () => {
  it("removes script contents, not merely the tags", () => {
    const text = htmlToText(
      '<p>Ingredients</p><script>var tracking = "200 g flour";</script><p>200 g flour</p>',
    );
    expect(text).not.toContain("tracking");
    expect(text).not.toContain("var ");
    expect(text).toContain("200 g flour");
  });

  it.each([
    ["style", "<style>.recipe { color: red }</style>", "color"],
    ["noscript", "<noscript>Enable JavaScript</noscript>", "Enable JavaScript"],
  ])("removes %s contents", (_label, markup, forbidden) => {
    expect(htmlToText(`<p>Real text</p>${markup}`)).not.toContain(forbidden);
  });

  it("strips attributes along with their tags", () => {
    const text = htmlToText('<a href="https://ads.example.com/track">Recipe</a>');
    expect(text).toContain("Recipe");
    expect(text).not.toContain("ads.example.com");
  });
});

describe("structure", () => {
  it("turns list items into separate lines", () => {
    const text = htmlToText("<ul><li>200 g flour</li><li>2 eggs</li></ul>");
    expect(text.split("\n").map((l) => l.trim())).toEqual(["200 g flour", "2 eggs"]);
  });

  it("turns line breaks and paragraphs into line breaks", () => {
    const text = htmlToText("<p>First</p><p>Second<br>Third</p>");
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines).toEqual(["First", "Second", "Third"]);
  });

  it("collapses runs of blank lines", () => {
    // Recipe pages are full of empty wrapper divs; without this the text is
    // mostly whitespace, which is billed by the token like anything else.
    const text = htmlToText("<p>A</p><div></div><div></div><div></div><p>B</p>");
    expect(text).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe("entities", () => {
  it.each([
    ["&amp;", "&"],
    ["&#39;", "'"],
    ["&quot;", '"'],
    ["&lt;", "<"],
    ["&gt;", ">"],
  ])("decodes %s", (entity, decoded) => {
    expect(htmlToText(`<p>a${entity}b</p>`)).toBe(`a${decoded}b`);
  });

  /**
   * Order matters: decoding the ampersand first would turn the escaped text
   * "&amp;lt;" into "<" rather than the literal "&lt;" the document contained.
   */
  it("decodes the ampersand last", () => {
    expect(htmlToText("<p>&amp;lt;</p>")).toBe("&lt;");
  });

  it("turns a non-breaking space into an ordinary one", () => {
    expect(htmlToText("<p>200&nbsp;g flour</p>")).toBe("200 g flour");
  });
});

describe("robustness", () => {
  /**
   * Recipe sites publish plenty of malformed markup. A parser that threw on it
   * would turn a recoverable import into an error page; this one degrades to
   * slightly ragged text, which the model reads perfectly well.
   */
  it.each([
    ["an unclosed tag", "<p>200 g flour", "200 g flour"],
    ["a stray closing tag", "200 g flour</p></div>", "200 g flour"],
    ["a malformed attribute", '<p class=">200 g flour</p>', "flour"],
  ])("survives %s", (_label, markup, expected) => {
    expect(() => htmlToText(markup)).not.toThrow();
    expect(htmlToText(markup)).toContain(expected);
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("   \n  ")).toBe("");
  });

  it("passes plain text through unchanged", () => {
    expect(htmlToText("200 g flour\n2 eggs")).toBe("200 g flour\n2 eggs");
  });
});

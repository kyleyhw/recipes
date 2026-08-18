import { describe, expect, it } from "vitest";
import { linkTitles } from "@/lib/content/cross-links";
import { loadCollection } from "@/lib/content/library";

/**
 * Tests for linking a recipe's name where it appears in prose.
 *
 * The Notes and Storage sections are plain text, so a recipe points at another
 * one by writing its name. That means the matching has to be exact: it is
 * running over free prose written by a person, and every false positive is a
 * link in the middle of a sentence that goes somewhere the sentence was not
 * talking about.
 */

const TARGETS = [
  { title: "Mapo Tofu", slug: "mapo-tofu" },
  {
    title: "Steamed Pork Patty with Salted Egg",
    slug: "steamed-pork-patty-with-salted-egg",
  },
  { title: "Roast Meat Soy Dressing", slug: "roast-meat-soy-dressing" },
];

describe("linkTitles", () => {
  it("splits a title out of the prose around it", () => {
    expect(linkTitles("See Mapo Tofu for the original.", TARGETS)).toEqual([
      "See ",
      { text: "Mapo Tofu", slug: "mapo-tofu" },
      " for the original.",
    ]);
  });

  it("leaves prose naming nothing alone", () => {
    expect(linkTitles("Two cubes rather than one and a half.", TARGETS)).toEqual([
      "Two cubes rather than one and a half.",
    ]);
  });

  it("links every mention, not only the first", () => {
    const chunks = linkTitles("Mapo Tofu, and again: Mapo Tofu.", TARGETS);
    expect(chunks.filter((chunk) => typeof chunk !== "string")).toHaveLength(2);
  });

  /**
   * The load-bearing case. A shorter title that is a prefix of a longer one
   * must not eat the longer one's link — the reader would be sent to a
   * different recipe from the one the sentence names.
   */
  it("prefers the longest title at a given position", () => {
    const targets = [
      { title: "Steamed Pork Patty", slug: "short" },
      { title: "Steamed Pork Patty with Salted Egg", slug: "long" },
    ];
    expect(linkTitles("see Steamed Pork Patty with Salted Egg here", targets)).toEqual([
      "see ",
      { text: "Steamed Pork Patty with Salted Egg", slug: "long" },
      " here",
    ]);
  });

  /**
   * The case that failed when this was written with `indexOf`. Notes are
   * hard-wrapped in the file at about eighty characters, so a three-word title
   * is as likely to arrive with a newline inside it as not — and a string
   * search finds the mentions that fall mid-line and misses the rest, which
   * looks like a working feature until you check.
   */
  it("matches a title that is wrapped across two lines", () => {
    const chunks = linkTitles("or Roast Meat Soy\nDressing over the rice", TARGETS);
    expect(chunks).toEqual([
      "or ",
      { text: "Roast Meat Soy\nDressing", slug: "roast-meat-soy-dressing" },
      " over the rice",
    ]);
  });

  it("is case-sensitive, so an ordinary phrase is not a link", () => {
    expect(linkTitles("a spoonful of roast meat soy dressing", TARGETS)).toEqual([
      "a spoonful of roast meat soy dressing",
    ]);
  });

  it("handles a title at the very start and the very end", () => {
    expect(linkTitles("Mapo Tofu", TARGETS)).toEqual([
      { text: "Mapo Tofu", slug: "mapo-tofu" },
    ]);
  });

  it("returns the text unchanged when there is nothing to link against", () => {
    expect(linkTitles("anything at all", [])).toEqual(["anything at all"]);
  });
});

describe("the shipped collection", () => {
  /**
   * Every cross-reference in the collection resolves. A note that says "see
   * Mapo Tofu" after that recipe has been renamed is a dead reference that
   * renders as ordinary text — no error, no link, and nobody finds out.
   *
   * This cannot check for references nobody wrote correctly in the first place;
   * it checks that the ones written as titles still are titles.
   */
  it("links the cross-references its recipes actually contain", () => {
    const { recipes } = loadCollection();
    const targets = recipes.map((recipe) => ({ title: recipe.title, slug: recipe.slug }));

    const linked = recipes.flatMap((recipe) =>
      [recipe.notes, recipe.storage]
        .filter((text): text is string => Boolean(text))
        .flatMap((text) =>
          linkTitles(
            text,
            targets.filter((t) => t.slug !== recipe.slug),
          )
            .filter((chunk) => typeof chunk !== "string")
            .map((chunk) => `${recipe.slug} -> ${chunk.slug}`),
        ),
    );

    // Not a fixed list: the point is that the references that exist resolve,
    // and that the mechanism is doing something rather than quietly nothing.
    expect(linked.length).toBeGreaterThan(0);
    expect(linked).toContain(
      "steamed-pork-patty-with-salted-egg -> roast-meat-soy-dressing",
    );
    expect(linked).toContain("crispy-roast-pork-belly -> roast-meat-soy-dressing");
  });
});

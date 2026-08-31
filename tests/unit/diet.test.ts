import { describe, expect, it } from "vitest";
import {
  containsFor,
  DIETS,
  DIET_KEYS,
  DIET_TAGS,
  dietsFor,
  isDietTag,
} from "@/lib/content/diet";

/**
 * Tests for working out who can eat a recipe.
 *
 * Every failure here is the same failure: saying yes when the answer is no. A
 * filter that hides a recipe somebody could have eaten is an inconvenience; one
 * that shows a recipe somebody cannot is the thing this whole module exists to
 * avoid, and it is why the unknown case is tested harder than the known ones.
 */

describe("the tag vocabulary", () => {
  it("recognises its own tags and nothing else", () => {
    for (const tag of DIET_TAGS) expect(isDietTag(tag)).toBe(true);
    expect(isDietTag("vegetarian")).toBe(false);
    expect(isDietTag("gluten-free")).toBe(false);
    expect(isDietTag("")).toBe(false);
  });

  /** Every diet has to be built out of tags an ingredient can actually carry. */
  it("builds every diet from real tags", () => {
    for (const diet of DIETS) {
      expect(diet.excludes.length).toBeGreaterThan(0);
      for (const tag of diet.excludes) expect(isDietTag(tag)).toBe(true);
    }
  });

  it("offers each diet exactly once", () => {
    expect(new Set(DIET_KEYS).size).toBe(DIET_KEYS.length);
  });
});

describe("working out a recipe's diets", () => {
  it("gives everything for a recipe that rules nothing out", () => {
    expect(dietsFor([])).toEqual([...DIET_KEYS]);
  });

  it("drops the diets a tag rules out and keeps the rest", () => {
    const diets = dietsFor(["pork", "meat"]);
    expect(diets).not.toContain("vegetarian");
    expect(diets).not.toContain("vegan");
    expect(diets).not.toContain("no-pork");
    expect(diets).toContain("no-gluten");
    expect(diets).toContain("no-shellfish");
  });

  /**
   * Vegetarian is not "no meat". Fish stock, fish sauce and gelatine are the
   * three that catch people out, and dashi is the one this collection is full
   * of — nothing in the words "kitsune udon" says the bowl is built on it.
   */
  it("is not vegetarian because of fish, and not vegan because of dairy", () => {
    expect(dietsFor(["fish"])).not.toContain("vegetarian");
    expect(dietsFor(["shellfish"])).not.toContain("vegetarian");
    expect(dietsFor(["dairy"])).toContain("vegetarian");
    expect(dietsFor(["dairy"])).not.toContain("vegan");
    expect(dietsFor(["egg"])).toContain("vegetarian");
    expect(dietsFor(["egg"])).not.toContain("vegan");
  });

  /** Anything vegan is vegetarian, for every combination of tags. */
  it("never calls a recipe vegan without also calling it vegetarian", () => {
    for (const tag of DIET_TAGS) {
      const diets = dietsFor([tag]);
      if (diets.includes("vegan")) expect(diets).toContain("vegetarian");
    }
  });

  it("keeps peanuts and tree nuts apart", () => {
    expect(dietsFor(["peanut"])).toContain("no-nuts");
    expect(dietsFor(["peanut"])).not.toContain("no-peanut");
    expect(dietsFor(["nuts"])).toContain("no-peanut");
    expect(dietsFor(["nuts"])).not.toContain("no-nuts");
  });

  /**
   * The one that matters most. An ingredient the library could not resolve is
   * an ingredient nothing knows anything about, and the absence of evidence
   * that it contains shellfish is not evidence that it does not. Claiming
   * nothing is the only safe answer, and it also puts the recipe in front of
   * somebody who can check it by hand rather than hiding it.
   */
  it("claims nothing at all about a recipe with an unresolved ingredient", () => {
    expect(dietsFor([], { unknown: true })).toEqual([]);
    expect(dietsFor(["pork"], { unknown: true })).toEqual([]);
    // And an unknown recipe is not quietly treated as clean by the filter: it
    // satisfies no diet, so any dietary filter excludes it.
    for (const key of DIET_KEYS) {
      expect(dietsFor([], { unknown: true })).not.toContain(key);
    }
  });

  it("takes any iterable of tags, including a set", () => {
    expect(dietsFor(new Set(["meat" as const]))).toEqual(dietsFor(["meat"]));
  });
});

describe("what a recipe contains, said out loud", () => {
  it("names alcohol and caffeine when they are there", () => {
    expect(containsFor(["alcohol"])).toEqual(["alcohol"]);
    expect(containsFor(["caffeine"])).toEqual(["caffeine"]);
    expect(containsFor(["alcohol", "caffeine"])).toEqual(["alcohol", "caffeine"]);
  });

  it("names nothing for a recipe with neither", () => {
    expect(containsFor(["fish", "gluten", "soy"])).toEqual([]);
  });

  it("names only these two, not every tag a recipe carries", () => {
    // A positive label for "contains fish" would be a second, louder copy of
    // the diet list, which is not what these are for.
    expect(containsFor(["fish", "dairy", "peanut", "alcohol"])).toEqual(["alcohol"]);
  });

  it("still names alcohol when another ingredient did not resolve", () => {
    // The asymmetry with dietsFor, and the reason containsFor takes no
    // `unknown` option at all: a diet claim is about everything a recipe does
    // not contain, so one unresolved line destroys it. This is a claim about
    // something that is there, and an unrelated unresolved line does not make
    // the wine in the jug any less real. Getting this backwards would serve
    // someone a drink they were avoiding.
    expect(dietsFor(["alcohol"], { unknown: true })).toEqual([]);
    expect(containsFor(["alcohol"])).toEqual(["alcohol"]);
  });
});

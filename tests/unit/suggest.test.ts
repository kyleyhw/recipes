import { describe, expect, it } from "vitest";
import { editDistance, suggestNames } from "@/lib/content/suggest";

/**
 * Tests for "did you mean?".
 *
 * The risk here is not being wrong, it is being confidently wrong: a
 * suggestion is going to be taken, so one that points at the wrong row is worse
 * than no suggestion at all. Most of what follows is therefore about *not*
 * offering something.
 *
 * The candidate list is the collection's own, because the near-misses that
 * matter are the ones this library actually contains — three soy sauces, two
 * sesames, a singular and a plural onion.
 */

const LIBRARY = [
  "light soy sauce",
  "dark soy sauce",
  "sesame oil",
  "sesame paste",
  "toasted sesame seeds",
  "spring onions",
  "onion",
  "garlic",
  "garlic powder",
  "egg",
  "egg white",
  "mirin",
  "miso",
];

describe("edit distance", () => {
  it("is zero for the same string and counts single edits", () => {
    expect(editDistance("garlic", "garlic")).toBe(0);
    expect(editDistance("garlick", "garlic")).toBe(1);
    expect(editDistance("sesme oil", "sesame oil")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });

  /** The ceiling is an optimisation and must not change any answer under it. */
  it("returns the true distance below the ceiling and gives up above it", () => {
    expect(editDistance("garlick", "garlic", 5)).toBe(1);
    expect(editDistance("garlick", "garlic", 1)).toBe(1);
    expect(editDistance("abcdefgh", "zzzzzzzz", 2)).toBeGreaterThan(2);
  });
});

describe("suggesting a library name", () => {
  it("catches a typo", () => {
    expect(suggestNames("garlick", LIBRARY)[0]).toBe("garlic");
    expect(suggestNames("sesme oil", LIBRARY)[0]).toBe("sesame oil");
    expect(suggestNames("mirn", LIBRARY)[0]).toBe("mirin");
  });

  /**
   * The commoner failure, and the one edit distance alone gets wrong: "soy
   * sauce" is six edits from "light soy sauce" and is obviously the right
   * suggestion, because the typed name is contained in the row whole.
   */
  it("catches a name that is less specific than the library's", () => {
    expect(suggestNames("soy sauce", LIBRARY)).toEqual([
      "dark soy sauce",
      "light soy sauce",
    ]);
    expect(suggestNames("sesame seeds", LIBRARY)[0]).toBe("toasted sesame seeds");
  });

  it("catches a singular where the row is plural", () => {
    expect(suggestNames("spring onion", LIBRARY)[0]).toBe("spring onions");
  });

  /**
   * Silence rather than a bad guess. Nothing in the library is close to any of
   * these, and offering the nearest string anyway is how a contributor ends up
   * with miso in their laksa.
   */
  it("says nothing when nothing is close", () => {
    expect(suggestNames("gochujang", LIBRARY)).toEqual([]);
    expect(suggestNames("za'atar", LIBRARY)).toEqual([]);
    expect(suggestNames("", LIBRARY)).toEqual([]);
  });

  /**
   * Short names get a tight ceiling for exactly this reason: at three letters,
   * almost everything is two edits from almost everything else.
   */
  it("does not treat every short word as a near miss", () => {
    expect(suggestNames("elm", LIBRARY)).toEqual([]);
    expect(suggestNames("egg", LIBRARY)).toContain("egg");
  });

  it("returns at most the limit asked for, nearest first", () => {
    const all = suggestNames("sesame", LIBRARY, 2);
    expect(all).toHaveLength(2);
    expect(all.every((name) => name.includes("sesame"))).toBe(true);
  });
});

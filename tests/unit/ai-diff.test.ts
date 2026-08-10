import { describe, expect, it } from "vitest";
import { applyLineEdits } from "@/lib/ai/diff";

/**
 * Tests for applying a proposed substitution to a recipe.
 *
 * The interesting behaviour here is entirely in the failure cases. A matching
 * function that works on well-formed input is easy; what matters is that an
 * edit which does not match is *reported* rather than applied somewhere
 * plausible, because a silently misapplied substitution produces a recipe that
 * looks complete and is wrong.
 */

const RECIPE = [
  "250 ml buttermilk",
  "300 g plain flour",
  "1 tsp bicarbonate of soda",
  "50 g butter, melted",
];

describe("matching", () => {
  it("replaces the line it names", () => {
    const outcome = applyLineEdits(RECIPE, [
      { from: "250 ml buttermilk", to: "240 ml whole milk plus 1 tbsp lemon juice" },
    ]);
    expect(outcome.lines[0]).toBe("240 ml whole milk plus 1 tbsp lemon juice");
    expect(outcome.lines.slice(1)).toEqual(RECIPE.slice(1));
    expect(outcome.unmatched).toHaveLength(0);
  });

  /**
   * A model reproducing a line it was given differs from the original in
   * exactly these ways — case, spacing, a typographic apostrophe. None of them
   * changes which line is meant, and refusing them all would make the feature
   * fail on its most common near-miss.
   */
  it.each([
    ["different case", "250 ML Buttermilk"],
    ["extra internal space", "250  ml  buttermilk"],
    ["leading and trailing space", "  250 ml buttermilk  "],
  ])("matches through %s", (_label, from) => {
    const outcome = applyLineEdits(RECIPE, [{ from, to: "replaced" }]);
    expect(outcome.lines[0]).toBe("replaced");
    expect(outcome.unmatched).toHaveLength(0);
  });

  it("normalises typographic apostrophes and dashes", () => {
    const lines = ["1 cook's spoon of gochujang", "2 tbsp soy-sauce"];
    const outcome = applyLineEdits(lines, [
      { from: "1 cook’s spoon of gochujang", to: "1 tbsp gochujang" },
      { from: "2 tbsp soy–sauce", to: "2 tbsp tamari" },
    ]);
    expect(outcome.lines).toEqual(["1 tbsp gochujang", "2 tbsp tamari"]);
  });

  /**
   * A loosely-specified edit must not consume the line another edit names
   * exactly, which is why exact matching is resolved across all edits before
   * any loosened match is considered.
   */
  it("gives an exactly-named line to the edit that names it exactly", () => {
    const lines = ["100 g Sugar", "100 g sugar"];
    const outcome = applyLineEdits(lines, [
      { from: "100 g sugar", to: "loose match wanted this" },
      { from: "100 g Sugar", to: "exact match" },
    ]);
    expect(outcome.lines).toEqual(["exact match", "loose match wanted this"]);
    expect(outcome.unmatched).toHaveLength(0);
  });
});

describe("failure to match", () => {
  /**
   * The central case. The alternative behaviours — appending the replacement,
   * or attaching it to the nearest line — both produce a recipe the cook
   * discovers is wrong while cooking from it.
   */
  it("reports an unmatched edit and changes nothing", () => {
    const outcome = applyLineEdits(RECIPE, [
      { from: "200 ml single cream", to: "200 ml oat cream" },
    ]);
    expect(outcome.lines).toEqual(RECIPE);
    expect(outcome.applied).toHaveLength(0);
    expect(outcome.unmatched).toEqual([
      { from: "200 ml single cream", to: "200 ml oat cream" },
    ]);
  });

  it("applies the edits it can and reports the ones it cannot", () => {
    const outcome = applyLineEdits(RECIPE, [
      { from: "250 ml buttermilk", to: "250 ml oat milk with lemon" },
      { from: "3 eggs", to: "3 tbsp aquafaba" },
    ]);
    expect(outcome.lines[0]).toBe("250 ml oat milk with lemon");
    expect(outcome.applied).toHaveLength(1);
    expect(outcome.unmatched).toHaveLength(1);
  });

  /**
   * Substring matching is deliberately not implemented. "butter" appears
   * inside "buttermilk", and a matcher loose enough to accept it would
   * substitute the wrong ingredient — the exact failure this module exists to
   * prevent.
   */
  it("does not match a substring of a line", () => {
    const outcome = applyLineEdits(RECIPE, [{ from: "butter", to: "margarine" }]);
    expect(outcome.lines).toEqual(RECIPE);
    expect(outcome.unmatched).toHaveLength(1);
  });
});

describe("multiple edits", () => {
  it("edits each line at most once", () => {
    // Two edits naming the same line must not compound: the second finds the
    // line already claimed and is reported instead.
    const outcome = applyLineEdits(RECIPE, [
      { from: "300 g plain flour", to: "300 g spelt flour" },
      { from: "300 g plain flour", to: "300 g rye flour" },
    ]);
    expect(outcome.lines[1]).toBe("300 g spelt flour");
    expect(outcome.applied).toHaveLength(1);
    expect(outcome.unmatched).toHaveLength(1);
  });

  it("applies independent edits together", () => {
    const outcome = applyLineEdits(RECIPE, [
      { from: "250 ml buttermilk", to: "250 ml oat milk with lemon" },
      { from: "50 g butter, melted", to: "50 g coconut oil, melted" },
    ]);
    expect(outcome.lines).toEqual([
      "250 ml oat milk with lemon",
      "300 g plain flour",
      "1 tsp bicarbonate of soda",
      "50 g coconut oil, melted",
    ]);
    expect(outcome.unmatched).toHaveLength(0);
  });

  it("leaves the recipe untouched when there are no edits", () => {
    const outcome = applyLineEdits(RECIPE, []);
    expect(outcome.lines).toEqual(RECIPE);
    expect(outcome.applied).toHaveLength(0);
    expect(outcome.unmatched).toHaveLength(0);
  });

  it("does not mutate the input", () => {
    const original = [...RECIPE];
    applyLineEdits(RECIPE, [{ from: "300 g plain flour", to: "300 g rye flour" }]);
    expect(RECIPE).toEqual(original);
  });
});

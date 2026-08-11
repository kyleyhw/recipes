import { describe, expect, it } from "vitest";
import { lineDiff, linesChanged } from "@/lib/ai/diff";

/**
 * Tests for the diff shown in a recipe's history.
 *
 * The diff is what a cook reads to answer "what did that change?", after the
 * change has already been applied. Its correctness is therefore not about
 * minimality in the abstract but about *legibility*: a one-line insertion must
 * read as one line added, not as every line below it having been rewritten.
 * That is the specific failure the cheaper alternatives to a longest-common-
 * subsequence diff exhibit, and the reason several tests below check the
 * unchanged lines as carefully as the changed ones.
 */

function rendered(diff: ReturnType<typeof lineDiff>): string[] {
  return diff.map(
    (line) =>
      `${line.op === "added" ? "+" : line.op === "removed" ? "-" : " "}${line.text}`,
  );
}

describe("no change", () => {
  it("reports every line as kept when nothing moved", () => {
    const lines = ["200 g flour", "2 eggs"];
    expect(lineDiff(lines, lines).every((line) => line.op === "kept")).toBe(true);
  });

  it("handles two empty lists", () => {
    expect(lineDiff([], [])).toEqual([]);
  });
});

describe("insertion and deletion", () => {
  /**
   * The load-bearing case. A naive positional comparison reports this as three
   * changed lines, because everything after the insertion has shifted by one.
   */
  it("reports an insertion near the top as one added line", () => {
    const before = ["200 g flour", "2 eggs", "100 ml milk"];
    const after = ["200 g flour", "1 tsp salt", "2 eggs", "100 ml milk"];
    expect(rendered(lineDiff(before, after))).toEqual([
      " 200 g flour",
      "+1 tsp salt",
      " 2 eggs",
      " 100 ml milk",
    ]);
  });

  it("reports a deletion as one removed line", () => {
    const before = ["200 g flour", "1 tsp salt", "2 eggs"];
    const after = ["200 g flour", "2 eggs"];
    expect(rendered(lineDiff(before, after))).toEqual([
      " 200 g flour",
      "-1 tsp salt",
      " 2 eggs",
    ]);
  });

  it("appends at the end without disturbing anything before it", () => {
    const diff = lineDiff(["a", "b"], ["a", "b", "c"]);
    expect(rendered(diff)).toEqual([" a", " b", "+c"]);
  });

  it("diffs against an empty list as all additions", () => {
    expect(lineDiff([], ["a", "b"]).every((line) => line.op === "added")).toBe(true);
    expect(lineDiff(["a", "b"], []).every((line) => line.op === "removed")).toBe(true);
  });
});

describe("modification", () => {
  /**
   * The case the whole feature exists for: told "it needs more butter", the
   * quantity on one line changes and nothing else does.
   */
  it("shows a changed quantity as that line removed and re-added", () => {
    const before = ["180 g butter", "300 g flour", "2 eggs"];
    const after = ["220 g butter", "300 g flour", "2 eggs"];
    expect(rendered(lineDiff(before, after))).toEqual([
      "-180 g butter",
      "+220 g butter",
      " 300 g flour",
      " 2 eggs",
    ]);
  });

  /**
   * Ordering within a replacement is a legibility decision, not a correctness
   * one: both orders are valid diffs. Removed-then-added is pinned because it
   * reads as "this became that", and a diff that alternated unpredictably
   * between the two would be harder to scan than either.
   */
  it("puts the removal before the addition", () => {
    const diff = lineDiff(["old"], ["new"]);
    expect(diff[0]?.op).toBe("removed");
    expect(diff[1]?.op).toBe("added");
  });

  it("handles a change at the very start", () => {
    expect(rendered(lineDiff(["a", "b", "c"], ["z", "b", "c"]))).toEqual([
      "-a",
      "+z",
      " b",
      " c",
    ]);
  });

  it("handles several separated changes", () => {
    const before = ["a", "b", "c", "d", "e"];
    const after = ["a", "B", "c", "d", "E"];
    expect(rendered(lineDiff(before, after))).toEqual([
      " a",
      "-b",
      "+B",
      " c",
      " d",
      "-e",
      "+E",
    ]);
  });
});

describe("repeated lines", () => {
  /**
   * Recipes genuinely repeat lines — "salt to taste" can appear twice, once for
   * the sauce and once for the pasta water. A diff that treated lines as a set,
   * or deduplicated them, would lose one of the two.
   */
  it("keeps both copies of a repeated line", () => {
    const lines = ["salt to taste", "200 g pasta", "salt to taste"];
    const diff = lineDiff(lines, lines);
    expect(diff).toHaveLength(3);
    expect(diff.filter((line) => line.text === "salt to taste")).toHaveLength(2);
  });

  it("removes only one copy when only one was removed", () => {
    const before = ["salt to taste", "200 g pasta", "salt to taste"];
    const after = ["salt to taste", "200 g pasta"];
    const diff = lineDiff(before, after);
    expect(diff.filter((line) => line.op === "removed")).toHaveLength(1);
    expect(diff.filter((line) => line.op === "kept")).toHaveLength(2);
  });
});

describe("the whole recipe is recoverable from the diff", () => {
  /**
   * A property test over an exact identity, needing no hand-computed expected
   * value: reading only the kept and removed lines reconstructs the original,
   * and only the kept and added lines reconstructs the new version. Any diff
   * that loses or invents a line breaks it.
   */
  const CASES: Array<[string[], string[]]> = [
    [
      ["a", "b", "c"],
      ["a", "x", "c"],
    ],
    [
      ["a", "b", "c"],
      ["c", "b", "a"],
    ],
    [[], ["a"]],
    [
      ["a", "a", "b"],
      ["a", "b", "b"],
    ],
    [
      ["200 g flour", "2 eggs"],
      ["250 g flour", "2 eggs", "1 tsp salt"],
    ],
  ];

  it.each(CASES)("round-trips both sides (%j -> %j)", (before, after) => {
    const diff = lineDiff(before, after);
    expect(diff.filter((l) => l.op !== "added").map((l) => l.text)).toEqual(before);
    expect(diff.filter((l) => l.op !== "removed").map((l) => l.text)).toEqual(after);
  });
});

describe("linesChanged", () => {
  it("is false for identical lists and true for any difference", () => {
    expect(linesChanged(["a", "b"], ["a", "b"])).toBe(false);
    expect(linesChanged(["a", "b"], ["a", "c"])).toBe(true);
    expect(linesChanged(["a"], ["a", "b"])).toBe(true);
    expect(linesChanged([], [])).toBe(false);
  });

  /**
   * Used to decide whether a model reply actually altered anything, so a
   * reordering must count as a change: the order of a method is the method.
   */
  it("treats a reordering as a change", () => {
    expect(linesChanged(["a", "b"], ["b", "a"])).toBe(true);
  });
});

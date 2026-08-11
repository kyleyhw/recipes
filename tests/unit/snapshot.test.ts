import { describe, expect, it } from "vitest";
import {
  parseSnapshot,
  SNAPSHOT_VERSION,
  snapshotSchema,
  snapshotsDiffer,
  type RecipeSnapshot,
} from "@/lib/snapshot";

/**
 * Tests for the revision snapshot format.
 *
 * A snapshot is read back by code that has moved on since it was written, and
 * it is the only copy of a version the owner may want restored. Two properties
 * therefore matter more than anything else here: that a snapshot is
 * **self-sufficient** — restorable without consulting any other row — and that
 * an unreadable one **fails softly**, costing that version rather than access to
 * the whole history.
 */

function snapshot(overrides: Partial<RecipeSnapshot> = {}): RecipeSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    title: "Dal Tarka",
    description: "Sharp and hot.",
    categoryName: "Mains",
    tagNames: ["quick", "vegan"],
    baseServings: 4,
    servingLabel: "serving",
    prepMinutes: 10,
    cookMinutes: 30,
    sourceUrl: "https://example.com/dal",
    notes: null,
    ingredients: ["200 g red lentils", "2 tbsp ghee"],
    steps: ["Simmer the lentils for 25 minutes.", "Temper the spices in the ghee."],
    ...overrides,
  };
}

describe("self-sufficiency", () => {
  /**
   * The format's central constraint. Category and tags travel as names, and
   * ingredients and steps as the text a person typed, so restoring runs the
   * same path as any hand edit — re-parsed and re-resolved — rather than
   * reinstating rows that bypassed the parser.
   */
  it("carries names rather than identifiers", () => {
    const parsed = snapshotSchema.safeParse(snapshot());
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.data)).not.toMatch(/[a-z0-9]{25}/); // no cuids
    if (parsed.success) {
      expect(parsed.data.categoryName).toBe("Mains");
      expect(parsed.data.tagNames).toEqual(["quick", "vegan"]);
    }
  });

  it("carries ingredients and steps as text, not parsed rows", () => {
    const parsed = parseSnapshot(snapshot());
    expect(parsed?.ingredients[0]).toBe("200 g red lentils");
    expect(typeof parsed?.steps[0]).toBe("string");
  });

  it("survives a JSON round trip, which is how it is stored", () => {
    const original = snapshot();
    expect(parseSnapshot(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  /**
   * The source URL is part of the snapshot, so restoring an old version does
   * not quietly detach a recipe from where it came from.
   */
  it("keeps the original source", () => {
    expect(parseSnapshot(snapshot())?.sourceUrl).toBe("https://example.com/dal");
  });
});

describe("failing softly", () => {
  /**
   * A history page that threw on one bad row would make that row destroy access
   * to every good one — the opposite of what a history is for.
   */
  it.each([
    ["null", null],
    ["a string", "not a snapshot"],
    ["an empty object", {}],
    ["an array", []],
    ["a snapshot missing its steps", { ...snapshot(), steps: undefined }],
    ["a snapshot with a non-positive serving count", { ...snapshot(), baseServings: 0 }],
  ])("returns null for %s rather than throwing", (_label, input) => {
    let result: RecipeSnapshot | null | undefined;
    expect(() => {
      result = parseSnapshot(input);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it("rejects a zero serving count, which would make scaling undefined", () => {
    expect(parseSnapshot({ ...snapshot(), baseServings: 0 })).toBeNull();
  });
});

describe("comparison", () => {
  it("is false for two identical snapshots", () => {
    expect(snapshotsDiffer(snapshot(), snapshot())).toBe(false);
  });

  it.each([
    ["title", { title: "Dal Fry" }],
    ["servings", { baseServings: 6 }],
    ["ingredients", { ingredients: ["300 g red lentils", "2 tbsp ghee"] }],
    ["steps", { steps: ["Simmer."] }],
    ["notes", { notes: "Keeps three days." }],
    ["tags", { tagNames: ["quick"] }],
    ["source", { sourceUrl: null }],
  ])("detects a change of %s", (_label, overrides) => {
    expect(snapshotsDiffer(snapshot(), snapshot(overrides))).toBe(true);
  });

  /**
   * Reordering the method is a change: the order of the steps is the method.
   * A comparison that sorted before comparing would call these equal.
   */
  it("detects a reordering of the steps", () => {
    const reordered = snapshot({
      steps: ["Temper the spices in the ghee.", "Simmer the lentils for 25 minutes."],
    });
    expect(snapshotsDiffer(snapshot(), reordered)).toBe(true);
  });
});

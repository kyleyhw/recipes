import { describe, expect, it } from "vitest";
import { changedSince, parseTouched, RECORD } from "@/lib/photos/staleness";

/**
 * Tests for noticing that a picture no longer describes its recipe.
 *
 * The whole of this is a parse and a comparison, and both have a way of being
 * quietly wrong rather than loudly broken — which is why they are tested at
 * all. A parse that misses the newest commit reports a stale picture as fresh;
 * a comparison that is not strict reports every picture in the collection as
 * stale, on the day it was drawn.
 *
 * The log format is the one `scripts/photos.ts` asks git for:
 * `--format=%x01%at --name-only`.
 */

const RECIPE = "content/recipes/mapo-tofu.md";
const PHOTO = "public/photos/mapo-tofu.webp";

const PATHS = {
  recipe: (slug: string) => `content/recipes/${slug}.md`,
  photo: (slug: string) => `public/photos/${slug}.webp`,
};

/** One commit's worth of the log, in the shape git emits it. */
function commit(at: number, ...paths: string[]): string {
  return [`${RECORD}${at}`, "", ...paths].join("\n");
}

describe("reading the log", () => {
  it("takes the timestamp of the commit each path appears under", () => {
    const touched = parseTouched(commit(1000, RECIPE, PHOTO));
    expect(touched.get(RECIPE)).toBe(1000);
    expect(touched.get(PHOTO)).toBe(1000);
  });

  /**
   * The log is newest-first, so the first sighting of a path is its latest.
   * Getting this backwards is the failure that matters: it would report every
   * picture as current, forever, and the report would look like it was working.
   */
  it("keeps the newest commit for a path, not the oldest", () => {
    const log = [
      commit(3000, RECIPE),
      commit(2000, RECIPE, PHOTO),
      commit(1000, RECIPE),
    ].join("\n");
    const touched = parseTouched(log);
    expect(touched.get(RECIPE)).toBe(3000);
    expect(touched.get(PHOTO)).toBe(2000);
  });

  it("ignores blank lines and a log with nothing in it", () => {
    expect(parseTouched("").size).toBe(0);
    expect(parseTouched("\n\n\n").size).toBe(0);
  });

  /**
   * An uncommitted edit is newer than any commit, and the usual way to arrive
   * at this question is to edit a recipe and then ask about it.
   */
  it("treats an uncommitted change as newer than everything", () => {
    const touched = parseTouched(commit(1000, RECIPE, PHOTO), ` M ${RECIPE}`);
    expect(touched.get(RECIPE)).toBe(Number.POSITIVE_INFINITY);
    expect(touched.get(PHOTO)).toBe(1000);
  });

  /** Porcelain writes a rename as "old -> new"; only the new path exists. */
  it("reads the destination of a rename out of the status", () => {
    const touched = parseTouched(
      "",
      `R  content/recipes/old.md -> ${RECIPE}\n?? ${PHOTO}`,
    );
    expect(touched.get(RECIPE)).toBe(Number.POSITIVE_INFINITY);
    expect(touched.get("content/recipes/old.md")).toBeUndefined();
    expect(touched.get(PHOTO)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("deciding what has changed since it was drawn", () => {
  /**
   * A photo run commits the image and the recipe's `photo:` line in one commit,
   * so equal timestamps are the *normal* state. A comparison that is not strict
   * would flag the entire collection the moment it was generated.
   */
  it("does not flag a recipe committed with its picture", () => {
    const touched = parseTouched(commit(1000, RECIPE, PHOTO));
    expect(changedSince(["mapo-tofu"], touched, PATHS)).toEqual([]);
  });

  it("flags a recipe edited after its picture was made", () => {
    const touched = parseTouched(
      [commit(2000, RECIPE), commit(1000, RECIPE, PHOTO)].join("\n"),
    );
    expect(changedSince(["mapo-tofu"], touched, PATHS)).toEqual(["mapo-tofu"]);
  });

  it("does not flag a picture redrawn after the recipe was edited", () => {
    const touched = parseTouched(
      [commit(2000, PHOTO), commit(1000, RECIPE, PHOTO)].join("\n"),
    );
    expect(changedSince(["mapo-tofu"], touched, PATHS)).toEqual([]);
  });

  /**
   * A recipe with no picture is *missing* one, which is a different thing and
   * is what a plain run draws. Reporting it here would put every new recipe in
   * a list headed "changed since its picture was drawn", which it has not been.
   */
  it("says nothing about a recipe that has no picture", () => {
    const touched = parseTouched(commit(1000, RECIPE));
    expect(changedSince(["mapo-tofu"], touched, PATHS)).toEqual([]);
  });

  /** Outside a checkout there is no answer, and no answer is not "all of them". */
  it("reports nothing when git said nothing", () => {
    expect(changedSince(["mapo-tofu", "borscht"], new Map(), PATHS)).toEqual([]);
  });
});

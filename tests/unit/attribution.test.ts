import { describe, expect, it } from "vitest";
import {
  adoptOwner,
  parseAttribution,
  personFrom,
  recipePathParts,
} from "@/lib/content/attribution";

/**
 * Tests for attribution read out of git.
 *
 * The feature's whole value is that nobody maintains it: a recipe arriving by
 * pull request is credited to whoever opened it, with no field to fill in. The
 * corresponding risk is that nobody maintains it either — a wrong name is
 * plausible, confident, and invisible to the person it is wrong about.
 *
 * So these tests are about the three ways the log can be misread. A rename must
 * not transfer authorship to whoever renamed the file. A translation must not
 * make the translator the author of the dish. And the *first* commit to add a
 * file must win over every later one, which is the difference between "who
 * wrote this" and "who touched it last".
 *
 * The fourth test here is about privacy rather than correctness: commit
 * addresses are read, and must never come out the other side.
 */

const RECORD = "\u0001";
const FIELD = "\u001f";

/** One commit's worth of `git log --name-status`, in the format git emits. */
function commit(
  hash: string,
  name: string,
  email: string,
  date: string,
  ...changes: string[]
): string {
  return [
    `${RECORD}${hash}${FIELD}${name}${FIELD}${email}${FIELD}${date}`,
    "",
    ...changes,
  ].join("\n");
}

const ADA = ["Ada Lovelace", "1024+ada@users.noreply.github.com"] as const;
const BOB = ["Bob Brown", "bob@example.com"] as const;
const CLEO = ["Cleo Chen", "cleo@users.noreply.github.com"] as const;

describe("recipePathParts", () => {
  it("reads a recipe's slug from its path", () => {
    expect(recipePathParts("content/recipes/banana-bread.md")).toEqual({
      slug: "banana-bread",
      language: null,
    });
  });

  it("attributes a translation to the recipe it translates", () => {
    expect(recipePathParts("content/recipes/banana-bread.ru.md")).toEqual({
      slug: "banana-bread",
      language: "ru",
    });
    // The regional form, which is the one a two-letter test would miss.
    expect(recipePathParts("content/recipes/banana-bread.zh-Hant.md")).toEqual({
      slug: "banana-bread",
      language: "zh-Hant",
    });
  });

  it("ignores anything that is not a recipe file", () => {
    expect(recipePathParts("content/ingredients.json")).toBeNull();
    expect(recipePathParts("content/recipes/drafts/thing.md")).toBeNull();
    expect(recipePathParts("docs/diagram.md")).toBeNull();
  });
});

describe("personFrom", () => {
  it("takes the handle out of a GitHub private address", () => {
    // Both forms: the numbered one GitHub issues now, and the bare one from
    // before it did.
    expect(personFrom("Ada", "1024+ada@users.noreply.github.com").handle).toBe("ada");
    expect(personFrom("Ada", "ada@users.noreply.github.com").handle).toBe("ada");
  });

  it("does not guess a handle from any other address", () => {
    // A guess here would link a real person's profile to a recipe they have
    // never seen, which is worse than an unlinked name.
    expect(personFrom("Bob Brown", "bob@example.com").handle).toBeNull();
    expect(
      personFrom("Bob", "bob@users.noreply.github.com.example.com").handle,
    ).toBeNull();
  });
});

describe("adoptOwner", () => {
  const log = [
    commit(
      ...["aaa", "kyleyhw", "kyle@example.com", "2026-01-04T09:00:00Z"],
      "A\tcontent/recipes/stew.md",
    ),
    commit(...["bbb", ...BOB, "2026-02-09T09:00:00Z"], "M\tcontent/recipes/stew.md"),
  ].join("\n");

  it("links the repository owner, whose handle the repository name gives", () => {
    const owned = adoptOwner(parseAttribution(log), "kyleyhw");
    expect(owned["stew"]?.addedBy).toEqual({ name: "kyleyhw", handle: "kyleyhw" });
  });

  it("leaves everyone else exactly as they were", () => {
    const owned = adoptOwner(parseAttribution(log), "kyleyhw");
    expect(owned["stew"]?.editedBy).toEqual([{ name: "Bob Brown", handle: null }]);
  });

  it("does nothing when the build was not told which repository it is", () => {
    // A clone built on a laptop. No handle is better than a guessed one.
    expect(adoptOwner(parseAttribution(log), null)["stew"]?.addedBy.handle).toBeNull();
  });
});

describe("parseAttribution", () => {
  it("credits the commit that added the file", () => {
    const log = commit(
      ...["aaa", ...ADA, "2026-01-04T09:00:00Z"],
      "A\tcontent/recipes/stew.md",
    );

    expect(parseAttribution(log)["stew"]).toEqual({
      addedBy: { name: "Ada Lovelace", handle: "ada" },
      addedOn: "2026-01-04",
      addedAt: Date.parse("2026-01-04T09:00:00Z"),
      addedCommit: "aaa",
      updatedOn: "2026-01-04",
      updatedAt: Date.parse("2026-01-04T09:00:00Z"),
      editedBy: [],
    });
  });

  /**
   * The day is what a page prints; the moment is what a "recently added" sort
   * needs, and it is the same field parsed rather than a second call to git.
   * Offsets are the reason it is parsed at all: two commits an hour apart from
   * different timezones compare correctly as instants and not as strings.
   */
  it("keeps the moment as well as the day, offsets and all", () => {
    const log = [
      commit(
        ...["aaa", ...ADA, "2026-01-04T09:00:00+09:00"],
        "A\tcontent/recipes/stew.md",
      ),
      commit(
        ...["bbb", ...BOB, "2026-01-04T09:00:00-05:00"],
        "M\tcontent/recipes/stew.md",
      ),
    ].join("\n");

    const stew = parseAttribution(log)["stew"];
    expect(stew?.addedOn).toBe("2026-01-04");
    expect(stew?.updatedOn).toBe("2026-01-04");
    // Same wall-clock day, fourteen hours apart, and the later one wins.
    expect(stew?.updatedAt).toBeGreaterThan(stew?.addedAt ?? 0);
    expect((stew?.updatedAt ?? 0) - (stew?.addedAt ?? 0)).toBe(14 * 60 * 60 * 1000);
  });

  /** A date git did not write sorts last rather than first. */
  it("takes an unparseable date as the epoch", () => {
    const log = commit(...["aaa", ...ADA, "not a date"], "A\tcontent/recipes/stew.md");
    expect(parseAttribution(log)["stew"]?.addedAt).toBe(0);
  });

  it("keeps the author when someone else edits it, and records the editor", () => {
    const log = [
      commit(...["aaa", ...ADA, "2026-01-04T09:00:00Z"], "A\tcontent/recipes/stew.md"),
      commit(...["bbb", ...BOB, "2026-02-09T09:00:00Z"], "M\tcontent/recipes/stew.md"),
    ].join("\n");

    const stew = parseAttribution(log)["stew"];
    expect(stew?.addedBy.name).toBe("Ada Lovelace");
    expect(stew?.addedOn).toBe("2026-01-04");
    expect(stew?.updatedOn).toBe("2026-02-09");
    expect(stew?.editedBy).toEqual([{ name: "Bob Brown", handle: null }]);
  });

  it("does not list the author as one of its editors", () => {
    const log = [
      commit(...["aaa", ...ADA, "2026-01-04T09:00:00Z"], "A\tcontent/recipes/stew.md"),
      commit(...["bbb", ...ADA, "2026-01-05T09:00:00Z"], "M\tcontent/recipes/stew.md"),
    ].join("\n");

    expect(parseAttribution(log)["stew"]?.editedBy).toEqual([]);
  });

  it("survives a rename: the person who wrote it is not the person who moved it", () => {
    // The failure this defends against is silent and total — the recipe would
    // read "Added by" whoever tidied up the filename.
    const log = [
      commit(
        ...["aaa", ...ADA, "2026-01-04T09:00:00Z"],
        "A\tcontent/recipes/beef-stew.md",
      ),
      commit(
        ...["bbb", ...BOB, "2026-02-09T09:00:00Z"],
        "R096\tcontent/recipes/beef-stew.md\tcontent/recipes/waterless-beef-stew.md",
      ),
    ].join("\n");

    const attribution = parseAttribution(log);
    expect(attribution["beef-stew"]).toBeUndefined();
    expect(attribution["waterless-beef-stew"]?.addedBy.name).toBe("Ada Lovelace");
    expect(attribution["waterless-beef-stew"]?.addedOn).toBe("2026-01-04");
    expect(attribution["waterless-beef-stew"]?.editedBy).toEqual([
      { name: "Bob Brown", handle: null },
    ]);
  });

  it("counts a translation as an edit and never as the recipe's origin", () => {
    const log = [
      commit(...["aaa", ...ADA, "2026-01-04T09:00:00Z"], "A\tcontent/recipes/stew.md"),
      commit(
        ...["ccc", ...CLEO, "2026-03-01T09:00:00Z"],
        "A\tcontent/recipes/stew.ru.md",
      ),
    ].join("\n");

    const stew = parseAttribution(log)["stew"];
    expect(stew?.addedBy.name).toBe("Ada Lovelace");
    expect(stew?.addedCommit).toBe("aaa");
    expect(stew?.editedBy).toEqual([{ name: "Cleo Chen", handle: "cleo" }]);
  });

  it("reports nothing for a file whose adding commit is not in the log", () => {
    // What a truncated history produces. Saying nothing is the point: the
    // alternative is crediting the recipe to whoever last edited it.
    const log = commit(
      ...["bbb", ...BOB, "2026-02-09T09:00:00Z"],
      "M\tcontent/recipes/stew.md",
    );

    expect(parseAttribution(log)["stew"]).toBeUndefined();
  });

  it("emits no email addresses", () => {
    const log = [
      commit(...["aaa", ...ADA, "2026-01-04T09:00:00Z"], "A\tcontent/recipes/stew.md"),
      commit(...["bbb", ...BOB, "2026-02-09T09:00:00Z"], "M\tcontent/recipes/stew.md"),
    ].join("\n");

    // The addresses are in the public history either way; republishing them as
    // text on a page is how they get harvested.
    expect(JSON.stringify(parseAttribution(log))).not.toContain("@");
  });

  it("ignores commits that touch nothing in content/recipes", () => {
    const log = [
      commit(...["aaa", ...ADA, "2026-01-04T09:00:00Z"], "A\tcontent/recipes/stew.md"),
      commit(...["ddd", ...BOB, "2026-02-09T09:00:00Z"], "M\tcontent/ingredients.json"),
    ].join("\n");

    expect(parseAttribution(log)["stew"]?.editedBy).toEqual([]);
    expect(parseAttribution(log)["stew"]?.updatedOn).toBe("2026-01-04");
  });
});

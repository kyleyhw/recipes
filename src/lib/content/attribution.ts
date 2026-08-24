import { execFileSync } from "node:child_process";
import { repoSlug } from "@/lib/site";

/**
 * Who added a recipe, and who has touched it since.
 *
 * ## Why there is no `addedBy:` field in the front matter
 *
 * Because it would be a second copy of something git already holds, and the two
 * would disagree. A front-matter field is written by whoever types it, so it
 * records a claim; a commit's author is recorded by the tool that took the
 * commit, travels through a fork and a pull request untouched, and is what
 * GitHub shows next to the merge. Adding a field would mean a recipe could say
 * one name while its history said another, and nothing would ever notice.
 *
 * So attribution is *derived*. This module reads `git log` at build time and
 * hands the pages a name per recipe. Nobody has to remember to fill anything
 * in, a contributor cannot get it wrong, and a recipe added by pull request is
 * attributed to the person who opened it without anyone doing anything.
 *
 * ## The one way this can lie, and what is done about it
 *
 * A shallow clone — which is what `actions/checkout` makes by default — has one
 * commit in it. `git log` against that reports every file as having been added
 * by whoever pushed last, which is a plausible, confident, wrong answer on every
 * recipe in the collection. So shallowness is checked for, and when the history
 * is not all here this module returns nothing at all. A missing line is obvious;
 * a wrong name is not. The workflow sets `fetch-depth: 0` to make the history
 * available, and the warning below says so if it is ever removed.
 *
 * ## Email addresses
 *
 * Are read and are never emitted. They are in the public history already, but
 * publishing them again as text on a web page is how they get scraped. The one
 * thing taken from an address is a GitHub handle, and only from the
 * `users.noreply.github.com` form, where the handle *is* the address.
 */

/** A person, as much of one as a commit records. */
export interface Person {
  /** The name on the commit, verbatim. */
  name: string;
  /** Their GitHub handle, where the commit's address gives it away. */
  handle: string | null;
}

export interface Attribution {
  addedBy: Person;
  /** ISO day the recipe was committed. */
  addedOn: string;
  /**
   * The same moment as `addedOn`, to the second, as milliseconds since the
   * epoch — and `updatedAt` likewise.
   *
   * The day is what a page shows and the moment is what an ordering needs. Two
   * thirds of this collection was committed on one afternoon, so a "recently
   * added" sort keyed on the day alone falls back to the title for sixty
   * recipes at once and reports alphabetical order as recency. The timestamp is
   * already in the log — `%aI` carries it, and the day was being cut out of it
   * — so this costs nothing to keep.
   */
  addedAt: number;
  /** The commit that added it, so the page can link to exactly that change. */
  addedCommit: string;
  /** ISO day of the most recent commit touching the recipe or a translation. */
  updatedOn: string;
  updatedAt: number;
  /** Everyone who has touched it since, in the order they first did. */
  editedBy: Person[];
}

const RECORD = "\u0001";
const FIELD = "\u001f";

/**
 * The log this module parses.
 *
 * Exported so the test can state exactly what it is a test of, and so the
 * command can be run by hand when a name on the site looks wrong.
 *
 * `--reverse` puts the oldest commit first, which makes both questions a single
 * pass: the first commit to add a file is the first `A` seen for it, and the
 * last commit to touch it is simply the last one seen. `--find-renames` matters
 * because a recipe that gets a better slug is the same recipe, and the person
 * who wrote it should not be replaced by whoever renamed the file.
 */
export const GIT_LOG_ARGS = [
  "log",
  "--reverse",
  "--find-renames",
  "--diff-filter=AMR",
  "--name-status",
  `--format=${RECORD}%H${FIELD}%an${FIELD}%ae${FIELD}%aI`,
  "--",
  "content/recipes",
];

/**
 * Splits a path in `content/recipes/` into the recipe it belongs to.
 *
 * `banana-bread.ru.md` belongs to `banana-bread`: translating a recipe is
 * working on that recipe, so it counts as an edit to it, and never as adding
 * one. Anything outside the directory, or nested inside it, is not a recipe.
 */
export function recipePathParts(
  path: string,
): { slug: string; language: string | null } | null {
  const prefix = "content/recipes/";
  if (!path.startsWith(prefix) || !path.endsWith(".md")) return null;
  const base = path.slice(prefix.length, -".md".length);
  if (base.length === 0 || base.includes("/")) return null;

  // The same shape the loader uses to tell a translation from a recipe.
  const translated = /^(.+)\.([a-z]{2}(?:-[A-Za-z]+)?)$/.exec(base);
  if (translated?.[1]) return { slug: translated[1], language: translated[2] ?? null };
  return { slug: base, language: null };
}

/**
 * A person from a commit's name and address.
 *
 * GitHub's private-address form carries the handle in it — `octocat@…` and
 * `1024+octocat@…` are both octocat — so a handle is available for anyone who
 * has email privacy switched on, which is the default, and for every edit made
 * through the GitHub web interface. For anyone else the name is shown without a
 * link, rather than a link being guessed at: a wrong profile link points at a
 * real person who has nothing to do with the recipe.
 */
export function personFrom(name: string, email: string): Person {
  const noreply =
    /^(?:\d+\+)?([A-Za-z\d](?:[A-Za-z\d]|-(?=[A-Za-z\d])){0,38})@users\.noreply\.github\.com$/i.exec(
      email.trim(),
    );
  return { name: name.trim(), handle: noreply?.[1] ?? null };
}

/** How two commits are decided to be the same person. */
function identity(person: Person): string {
  return (person.handle ?? person.name).toLowerCase();
}

interface Building {
  addedBy: Person | null;
  addedOn: string | null;
  addedAt: number;
  addedCommit: string | null;
  updatedOn: string;
  updatedAt: number;
  people: Person[];
}

/**
 * Turns the log into one attribution per recipe.
 *
 * Pure, and separated from running git for the usual reason: this is where the
 * mistakes live — rename handling, translations counting as edits, the first
 * `A` winning over later ones — and none of them need a repository to test.
 */
export function parseAttribution(log: string): Record<string, Attribution> {
  const building = new Map<string, Building>();
  let author: Person | null = null;
  let commit = "";
  let day = "";
  let at = 0;

  const touch = (slug: string, by: Person): Building => {
    let record = building.get(slug);
    if (!record) {
      record = {
        addedBy: null,
        addedOn: null,
        addedAt: 0,
        addedCommit: null,
        updatedOn: day,
        updatedAt: at,
        people: [],
      };
      building.set(slug, record);
    }
    record.updatedOn = day;
    record.updatedAt = at;
    if (!record.people.some((person) => identity(person) === identity(by))) {
      record.people.push(by);
    }
    return record;
  };

  for (const line of log.split("\n")) {
    if (line.startsWith(RECORD)) {
      const [hash = "", name = "", email = "", date = ""] = line.slice(1).split(FIELD);
      commit = hash;
      author = personFrom(name, email);
      day = date.slice(0, 10);
      // `%aI` is offset-bearing, so parsing it is what makes two commits from
      // different timezones comparable. A log line git did not write — a
      // malformed fixture — parses to NaN and is taken as the epoch, which puts
      // it last in a recency sort rather than first.
      const parsed = Date.parse(date);
      at = Number.isFinite(parsed) ? parsed : 0;
      continue;
    }
    if (line.length === 0 || !author) continue;

    const by = author;
    const parts = line.split("\t");
    const status = parts[0] ?? "";

    // A rename carries the whole history with it: the new path inherits
    // everything the old one had, including who wrote it.
    if (status.startsWith("R")) {
      const from = recipePathParts(parts[1] ?? "");
      const to = recipePathParts(parts[2] ?? "");
      if (from && to) {
        const carried = building.get(from.slug);
        if (carried && from.slug !== to.slug) {
          building.set(to.slug, carried);
          building.delete(from.slug);
        }
      }
      if (to) touch(to.slug, by);
      continue;
    }

    const file = recipePathParts(parts[1] ?? "");
    if (!file) continue;
    const record = touch(file.slug, by);

    // Only the recipe's own file can be the moment it was added. A translation
    // appearing first — possible if a recipe were renamed oddly — must not make
    // the translator the author of the dish.
    if (status.startsWith("A") && file.language === null && !record.addedBy) {
      record.addedBy = by;
      record.addedOn = day;
      record.addedAt = at;
      record.addedCommit = commit;
    }
  }

  const attribution: Record<string, Attribution> = {};
  for (const [slug, record] of building) {
    if (!record.addedBy || !record.addedOn || !record.addedCommit) continue;
    const adder = identity(record.addedBy);
    attribution[slug] = {
      addedBy: record.addedBy,
      addedOn: record.addedOn,
      addedAt: record.addedAt,
      addedCommit: record.addedCommit,
      updatedOn: record.updatedOn,
      updatedAt: record.updatedAt,
      editedBy: record.people.filter((person) => identity(person) !== adder),
    };
  }
  return attribution;
}

/**
 * Gives the repository's owner their own handle.
 *
 * The owner's commits are the one case where a handle can be known without
 * being in the address: whoever owns `kyleyhw/recipes` is `kyleyhw`, and a
 * commit whose author name is exactly that is them. It is an exact match
 * against a login this build was told, not a guess from a display name — every
 * other unlinked name stays unlinked.
 *
 * It exists because the owner of a collection is the person who added most of
 * it, and a repository whose own owner is the only unlinked name on the site
 * looks broken.
 */
export function adoptOwner(
  attribution: Record<string, Attribution>,
  owner: string | null,
): Record<string, Attribution> {
  if (!owner) return attribution;
  const adopt = (person: Person): Person =>
    person.handle === null && person.name.toLowerCase() === owner.toLowerCase()
      ? { name: person.name, handle: owner }
      : person;

  return Object.fromEntries(
    Object.entries(attribution).map(([slug, record]) => [
      slug,
      {
        ...record,
        addedBy: adopt(record.addedBy),
        editedBy: record.editedBy.map(adopt),
      },
    ]),
  );
}

function git(args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...args], {
      encoding: "utf8",
      // A collection large enough to exceed this has other problems, but a
      // truncated log would drop the oldest commits — the ones that say who
      // added what — so it is set well past any plausible size.
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // No git, no repository, or a git too old for one of these flags. A recipe
    // book built from a downloaded zip is a working recipe book.
    return null;
  }
}

let cached: Record<string, Attribution> | null = null;

/**
 * Attribution for the whole collection, read once per build.
 *
 * Memoised because `loadCollection` runs for every generated page and this is a
 * subprocess: at one recipe per page plus four export files each, the same log
 * would otherwise be read a hundred times to produce the same answer.
 */
export function loadAttribution(): Record<string, Attribution> {
  if (cached) return cached;

  if (git(["rev-parse", "--is-shallow-repository"])?.trim() === "true") {
    console.warn(
      "Attribution skipped: this is a shallow clone, so git only knows about the most recent commit. " +
        "Every recipe would be credited to whoever pushed last. Set `fetch-depth: 0` on actions/checkout.",
    );
    cached = {};
    return cached;
  }

  const log = git(GIT_LOG_ARGS);
  cached =
    log === null
      ? {}
      : adoptOwner(parseAttribution(log), repoSlug()?.split("/")[0] ?? null);
  return cached;
}

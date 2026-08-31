/**
 * Which pictures have stopped describing their recipe.
 *
 * A generated photograph is drawn from a recipe at a moment in time. Edit the
 * recipe afterwards — rename the dish, add an ingredient, drop a garnish — and
 * the picture goes on being a picture of the old one, silently and forever,
 * because nothing about an image knows what it was made from.
 *
 * Two dates answer it, both from git: when the recipe was last committed, and
 * when its picture was. A photo run writes the image and the recipe's `photo:`
 * line together, so equal timestamps are the normal state and only a later edit
 * to the recipe counts.
 *
 * A date is only half the answer, though, because most edits to a recipe cannot
 * change its picture. Refiling a hundred and twenty recipes under new
 * categories, fixing a typo in a note, adding a line to the log: every one of
 * those moves the recipe's timestamp past its photo's and none of them changes
 * what the photograph should show. So the date is the coarse filter and the
 * prompt's fingerprint is the fine one — see `outdatedPhotos`.
 *
 * **This is a report and not a trigger.** Nothing here redraws anything. What
 * it produces is a list for a person to read, because redrawing a collection of
 * images is a decision with a price on it and it belongs to whoever is paying.
 *
 * Pure, and separated from running git for the usual reason: the mistakes live
 * in the parse — the record marker, the rename arrow, the fact that the newest
 * commit is seen first — and none of them need a repository to test.
 */

/** The byte that opens a commit line, chosen because no path contains it. */
export const RECORD = "";

/**
 * `git log --format=%x01%at --name-only` and `git status --porcelain`, as one
 * map from path to when it was last touched, in seconds since the epoch.
 *
 * A path with uncommitted changes comes back as `Infinity` — newer than any
 * commit, which is precisely what it is, and worth getting right because the
 * usual way to arrive at this question is to edit a recipe and then ask.
 */
export function parseTouched(log: string, status = ""): Map<string, number> {
  const touched = new Map<string, number>();

  let at = 0;
  for (const line of log.split("\n")) {
    if (line.startsWith(RECORD)) {
      at = Number(line.slice(1)) || 0;
      continue;
    }
    const path = line.trim();
    // The log is newest-first, so the first sighting of a path is its latest.
    if (path.length > 0 && !touched.has(path)) touched.set(path, at);
  }

  for (const line of status.split("\n")) {
    // "XY path", and for a rename "XY old -> new". The destination is the one
    // that exists now, so it is the one whose staleness can be asked about.
    if (line.length < 4) continue;
    const path = line.slice(3).split(" -> ").pop()?.trim();
    if (path) touched.set(path, Number.POSITIVE_INFINITY);
  }

  return touched;
}

/**
 * The slugs whose recipe has been committed since their picture was.
 *
 * A slug with no picture is not stale — it is missing, which is a different
 * thing and is what a plain run draws. A slug git has nothing to say about is
 * left out rather than guessed at, which is also what makes this return nothing
 * at all outside a checkout.
 */
export function changedSince(
  slugs: readonly string[],
  touched: ReadonlyMap<string, number>,
  paths: { recipe: (slug: string) => string; photo: (slug: string) => string },
): string[] {
  return slugs.filter((slug) => {
    const recipeAt = touched.get(paths.recipe(slug));
    const photoAt = touched.get(paths.photo(slug));
    if (recipeAt === undefined || photoAt === undefined) return false;
    return recipeAt > photoAt;
  });
}

/** What a pass over the collection found. */
export interface Outdated {
  /** Changed since the picture, in a way that changes the picture. */
  outdated: string[];
  /** Changed since the picture, but not in any way the picture depends on. */
  unaffected: string[];
}

/**
 * Splits the changed set by whether the change could have altered the picture.
 *
 * `changedSince` answers "has this recipe been edited since its photograph",
 * which is a question about timestamps and over-reports badly: a bulk edit
 * across the collection puts every recipe on the list, and a reader who has
 * been told a hundred and twenty pictures are out of date learns nothing from
 * the hundred and twenty-first.
 *
 * The precise question is whether the recipe's own text has changed the prompt:
 * render the recipe as it is now, render the recipe as it stood when the
 * picture was drawn, and compare. Same prompt, same picture — the edit was to
 * something the camera never saw.
 *
 * **Both prompts must come from the same template.** It is tempting to compare
 * against the fingerprint the recipe already stores in `photoPrompt`, which is
 * free and already there, and it answers the wrong question: that hash was
 * taken under whatever the prompt in scripts/photos.ts said at the time, so
 * improving one sentence in it puts the entire collection out of date at once.
 * Rendering both sides through today's template cancels the template out and
 * leaves only what the recipe did.
 *
 * A slug the caller cannot answer for on either side is in neither list.
 * Nothing generated it, or nothing can be reconstructed for it, so nothing here
 * has an opinion about it.
 */
export function outdatedPhotos(
  changed: readonly string[],
  fingerprints: {
    /** The prompt this recipe produces today. */
    now: (slug: string) => string | null;
    /** The prompt the recipe produced when its picture was drawn, rendered by
     * today's template. Null where that cannot be reconstructed. */
    drawnFrom: (slug: string) => string | null;
  },
): Outdated {
  const outdated: string[] = [];
  const unaffected: string[] = [];

  for (const slug of changed) {
    const now = fingerprints.now(slug);
    const drawnFrom = fingerprints.drawnFrom(slug);
    if (now === null || drawnFrom === null) continue;
    (now === drawnFrom ? unaffected : outdated).push(slug);
  }

  return { outdated, unaffected };
}

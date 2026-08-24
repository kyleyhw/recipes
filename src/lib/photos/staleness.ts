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

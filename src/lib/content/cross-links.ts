/**
 * Turning a recipe's name, written in prose, into a link to it.
 *
 * The Notes and Storage sections are plain text, not Markdown — a `[link](x.md)`
 * written in one renders as brackets and a filename, which has happened twice
 * here and is recorded in content/memories.md. That rule stands, and this is how
 * a recipe still gets to point at another one: the file says
 * "see Roast Meat Soy Dressing", exactly as a person would write it, and the
 * site turns the name into a link because it happens to know every recipe's
 * name.
 *
 * Nothing is added to the file to make that work, which is the point. A recipe
 * remains readable as plain text on GitHub, in an editor, or printed, and the
 * link exists only where links exist at all.
 */

export interface TitleTarget {
  /** The title as it is written, in any language the recipe has. */
  title: string;
  slug: string;
}

export type ProseChunk = string | { text: string; slug: string };

/**
 * Splits prose into plain runs and recipe names.
 *
 * Matching is exact in its words and *loose in its whitespace*, and that second
 * part is load-bearing: these notes are hard-wrapped in the file at about eighty
 * characters, so "Roast Meat Soy Dressing" is as likely to arrive with a
 * newline inside it as not. A plain string search finds the mentions that
 * happen to fall in the middle of a line and silently misses the rest, which is
 * the worst kind of failure — it works often enough to look finished.
 *
 * Otherwise it is strict. Case-sensitive, because a title is a proper noun and
 * "a spoonful of roast meat soy dressing" is a description rather than a
 * reference; and longest-first, so a title that is a prefix of a longer one
 * cannot eat the longer one's link and send a reader to the wrong recipe.
 */
export function linkTitles(text: string, targets: readonly TitleTarget[]): ProseChunk[] {
  const patterns = targets
    .filter((target) => target.title.trim().length > 0)
    .map((target) => ({
      target,
      // Words joined by whatever whitespace the file happens to hold.
      pattern: new RegExp(
        target.title
          .trim()
          .split(/\s+/)
          .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("\\s+"),
        "g",
      ),
    }))
    .sort((a, b) => b.target.title.length - a.target.title.length);

  if (patterns.length === 0) return [text];

  const chunks: ProseChunk[] = [];
  let from = 0;

  while (from < text.length) {
    let at = -1;
    let matched = "";
    let hit: TitleTarget | null = null;

    for (const { target, pattern } of patterns) {
      pattern.lastIndex = from;
      const found = pattern.exec(text);
      if (!found) continue;
      // Earliest wins; at the same position the longer match wins, which the
      // sort has already put first.
      if (at === -1 || found.index < at) {
        at = found.index;
        matched = found[0];
        hit = target;
      }
    }

    if (at === -1 || !hit) break;

    if (at > from) chunks.push(text.slice(from, at));
    chunks.push({ text: matched, slug: hit.slug });
    from = at + matched.length;
  }

  if (from < text.length) chunks.push(text.slice(from));
  return chunks;
}

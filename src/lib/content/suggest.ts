/**
 * "Did you mean?" for an ingredient name that matched nothing.
 *
 * The single most common way a contributed recipe fails is an ingredient line
 * whose name is nearly a library row: `soy sauce` for `light soy sauce`,
 * `spring onion` for `spring onions`, `sesame seeds` for `toasted sesame
 * seeds`. The test suite already catches all of them, and says only that the
 * line matched nothing — which leaves the contributor to read 180 rows.
 *
 * So this exists to turn "no match" into "no match; did you mean X?", which is
 * the difference between a five-minute fix and a lost afternoon.
 *
 * Levenshtein rather than anything cleverer. The alternative — a trigram index
 * — is what the database gave this project for free and what the static
 * re-platform took away; at 180 rows a full O(n·m) pass over every candidate
 * costs microseconds and needs no index to go stale.
 */

/**
 * Edit distance, with a ceiling.
 *
 * `max` short-circuits the row scan: once every cell in a row exceeds it, no
 * later row can come back under, so the answer cannot beat the ceiling and the
 * exact value stops mattering.
 */
export function editDistance(
  a: string,
  b: string,
  max = Number.POSITIVE_INFINITY,
): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const cell = Math.min(substitution, deletion, insertion);
      current.push(cell);
      if (cell < best) best = cell;
    }
    if (best > max) return max + 1;
    previous = current;
  }

  return previous[b.length] ?? max + 1;
}

/**
 * The library names closest to `name`, nearest first.
 *
 * Two ways in, because the two failures look different. A *typo* is close by
 * edit distance — `sesme oil` — and a *wrong specificity* is not: `soy sauce`
 * is six edits from `light soy sauce` but is contained in it whole, which is
 * the stronger signal of the two and is ranked first.
 *
 * Returns at most `limit`, and returns nothing rather than a bad guess: a
 * suggestion that is wrong is worse than none, because it will be taken.
 */
export function suggestNames(
  name: string,
  candidates: readonly string[],
  limit = 3,
): string[] {
  const needle = name.trim().toLowerCase();
  if (needle.length === 0) return [];

  // A quarter of the length, floored at 1 and capped at 5. Short names can
  // afford almost nothing: `egg` is two edits from `elm`, and a suggestion of
  // egg to somebody who typed elm is worse than silence. Long ones can afford
  // more, because a nine-letter word two edits out is nearly always a typo.
  const ceiling = Math.min(5, Math.max(1, Math.round(needle.length / 4)));

  const scored = candidates
    .map((candidate) => {
      const haystack = candidate.toLowerCase();
      // Containment either way — "soy sauce" inside "light soy sauce", or
      // "toasted sesame seeds" typed where the row is "sesame seeds".
      const contained = haystack.includes(needle) || needle.includes(haystack);
      const distance = editDistance(needle, haystack, ceiling);
      return { candidate, contained, distance };
    })
    .filter((entry) => entry.contained || entry.distance <= ceiling)
    .sort(
      (a, b) =>
        Number(b.contained) - Number(a.contained) ||
        a.distance - b.distance ||
        a.candidate.localeCompare(b.candidate),
    );

  return scored.slice(0, limit).map((entry) => entry.candidate);
}

/**
 * Applying a model's proposed line edits to a recipe.
 *
 * A substitution comes back as a list of (original line, replacement line)
 * pairs, where the original is supposed to reproduce a line of the recipe
 * verbatim. Applying it is therefore a matching problem, and the interesting
 * part is what happens when the match fails.
 *
 * The rule here is that an edit which matches nothing is **reported, not
 * applied**. The tempting alternative — append it, or fuzzily attach it to the
 * nearest line — produces a recipe that looks complete and is wrong, and the
 * cook discovers it standing at the hob. An unmatched edit surfaced in the
 * preview is a minor annoyance; a silently misapplied one ruins dinner.
 *
 * Pure, so both the matching and the failure reporting are directly testable.
 */

/** One line of a rendered diff. */
export interface DiffLine {
  op: "kept" | "added" | "removed";
  text: string;
}

/**
 * Diffs two lists of lines, for showing what a revision changed.
 *
 * Used where a change arrives as a *replacement* rather than as targeted edits:
 * a message in the recipe log ("it needs more butter") can require rebalancing
 * several lines at once, so the model returns the whole new list and the diff is
 * computed here rather than described by the model. A described diff would be
 * prose about the change; this is the change.
 *
 * Longest common subsequence, computed by the standard dynamic program. It is
 * O(nm) in time and space, which is irrelevant at the size of a recipe — tens of
 * lines — and is worth having over a cheaper heuristic because the cheap ones
 * (matching only at the ends, or line-by-line in order) report an insertion near
 * the top as though every line below it had changed, which is exactly the case a
 * cook needs to read clearly.
 */
export function lineDiff(
  before: readonly string[],
  after: readonly string[],
): DiffLine[] {
  const n = before.length;
  const m = after.length;

  // lengths[i][j] is the LCS length of before[i..] and after[j..]. Filled
  // backwards so the traceback below runs forwards, which keeps the output in
  // reading order without a final reverse.
  const lengths: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = lengths[i];
      const next = lengths[i + 1];
      if (!row || !next) continue;
      row[j] =
        before[i] === after[j]
          ? (next[j + 1] ?? 0) + 1
          : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      diff.push({ op: "kept", text: before[i] ?? "" });
      i++;
      j++;
      continue;
    }
    // A removal is preferred when it leads to at least as long a common
    // subsequence, so a replaced line reads as removed-then-added rather than
    // added-then-removed.
    const keepingBefore = lengths[i + 1]?.[j] ?? 0;
    const keepingAfter = lengths[i]?.[j + 1] ?? 0;
    if (keepingBefore >= keepingAfter) {
      diff.push({ op: "removed", text: before[i] ?? "" });
      i++;
    } else {
      diff.push({ op: "added", text: after[j] ?? "" });
      j++;
    }
  }
  while (i < n) diff.push({ op: "removed", text: before[i++] ?? "" });
  while (j < m) diff.push({ op: "added", text: after[j++] ?? "" });

  return diff;
}

/** True when the two lists differ at all. */
export function linesChanged(
  before: readonly string[],
  after: readonly string[],
): boolean {
  return before.length !== after.length || before.some((line, i) => line !== after[i]);
}

export interface LineEdit {
  from: string;
  to: string;
}

export interface EditOutcome {
  lines: string[];
  applied: LineEdit[];
  /** Edits whose `from` matched no line. Shown to the owner, never applied. */
  unmatched: LineEdit[];
}

/**
 * Loosens a line for comparison: case, surrounding space, internal runs of
 * space, and the typographic variants of the apostrophe and the hyphen.
 *
 * These are exactly the differences that arise when a model reproduces a line
 * it was given rather than copying it mechanically, and none of them changes
 * which line is meant. Anything looser — dropping words, comparing prefixes —
 * would start matching different ingredients to each other.
 */
function loosen(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

/**
 * Applies edits to a list of lines.
 *
 * Each edit consumes at most one line, and each line is edited at most once, so
 * two edits naming the same original cannot compound into a double
 * substitution. Exact matches are resolved first, across all edits, before any
 * loosened match is considered: otherwise an edit with a sloppy `from` could
 * consume the line that another edit names exactly.
 */
export function applyLineEdits(
  lines: readonly string[],
  edits: readonly LineEdit[],
): EditOutcome {
  const result = [...lines];
  const claimed = new Set<number>();
  const applied: LineEdit[] = [];
  const unmatched: LineEdit[] = [];
  const pending: LineEdit[] = [];

  const claim = (index: number, edit: LineEdit): void => {
    result[index] = edit.to;
    claimed.add(index);
    applied.push(edit);
  };

  for (const edit of edits) {
    const index = result.findIndex(
      (line, i) => !claimed.has(i) && line.trim() === edit.from.trim(),
    );
    if (index === -1) pending.push(edit);
    else claim(index, edit);
  }

  for (const edit of pending) {
    const target = loosen(edit.from);
    const index = result.findIndex(
      (line, i) => !claimed.has(i) && loosen(line) === target,
    );
    if (index === -1) unmatched.push(edit);
    else claim(index, edit);
  }

  return { lines: result, applied, unmatched };
}

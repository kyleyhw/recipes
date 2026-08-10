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

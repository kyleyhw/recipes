# Test report — Phase 8: Provenance, the recipe log, and history

**Date:** 2026-08-11
**Scope:** recording and displaying a recipe's original source; the per-recipe
log of notes and messages; revision snapshots, diffs, and restore; the desktop
and mobile layout.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Full unit suite (282 tests, 16 files) | ~1.7 s |
| The two new files (39 tests) | 303 ms |
| `line-diff.test.ts` (23 tests) | 18 ms |
| `snapshot.test.ts` (16 tests) | 8 ms |
| Log and history browser flow (26 assertions) | ~31 s |
| Responsive flow, three widths (19 assertions) | ~14 s |
| Model-failure flow (8 assertions) | ~12 s |
| Production build | 15 s |

---

## 1. `line-diff.test.ts` — the diff a cook reads

The diff is what answers "what did that change?", *after* the change has been
applied. Its correctness is therefore about legibility rather than minimality: a
one-line insertion must read as one line added, not as every line below it
having been rewritten. That is exactly what the cheaper alternatives to a
longest-common-subsequence diff produce, which is why several tests assert on
the *unchanged* lines as carefully as on the changed ones.

| Test | What it defends |
| --- | --- |
| An insertion near the top is one added line | The load-bearing case. A positional comparison reports it as three changed lines, because everything below has shifted by one |
| A deletion is one removed line | The same failure, mirrored |
| A changed quantity is that line removed and re-added | The case the feature exists for: told "more butter", one line changes and nothing else does |
| The removal precedes the addition | A legibility decision, pinned so the ordering does not vary unpredictably between replacements |
| Both copies of a repeated line survive | Recipes genuinely repeat lines — "salt to taste" for the sauce and for the pasta water. A set-based or deduplicating diff loses one |
| Removing one of two identical lines removes exactly one | Same |
| **Round-trip property, five input pairs** | An exact identity needing no hand-computed expected value: kept+removed reconstructs the old version, kept+added the new. Any diff that loses or invents a line breaks it |
| `linesChanged` treats a reordering as a change | It decides whether a model reply altered anything, and the order of a method *is* the method |

The round-trip cases were chosen to cover the shapes that break naive
implementations: a substitution, a full reversal, growth from empty, and
adjacent duplicates (`["a","a","b"] → ["a","b","b"]`), where a greedy matcher
pairs the wrong copies.

## 2. `snapshot.test.ts` — the format a restore depends on

A snapshot is read back by code that has moved on, and it is the only copy of a
version the owner may want back. Two properties dominate:

| Test | What it defends |
| --- | --- |
| Names, not identifiers | A snapshot must be restorable consulting no other row. The test asserts no cuid-shaped string appears anywhere in it |
| Ingredients and steps as **text** | Restoring then runs the ordinary edit path — re-parsed, re-resolved — so a restored recipe is indistinguishable from a typed one and later parser improvements reach it |
| Survives a JSON round trip | It is stored in a `Json` column; nothing else about the format matters if this fails |
| The source URL is part of it | Restoring an old version must not quietly detach a recipe from where it came from |
| **Six malformed inputs return null rather than throwing** | A history page that threw on one bad row would let that row destroy access to every good one — the opposite of what a history is for |
| A zero serving count is rejected | It is the denominator of the scaling factor |
| A reordering of the steps counts as a change | Sorting before comparing would call these equal |

---

## 3. Browser verification

Chromium against the real PGlite Postgres.

### 3.1 Provenance, the log, and history — 26 assertions, all passed

| Assertion | Result |
| --- | --- |
| Source shown as the site's name under the title | PASS |
| The link target is the full original address | PASS |
| A closed recipe page shows the log as a single **Notes** line and no chat box | PASS |
| The log opens from the URL, with the recipe still on the page | PASS |
| A note is recorded, labelled a note rather than a message | PASS |
| Closing returns the plain recipe; the closed line carries the count | PASS |
| A hand edit applies and records a version | PASS |
| **The pre-edit state was captured as a baseline** | PASS |
| The diff shows the old quantity removed, the new added, and the new line added | PASS |
| Unchanged lines are not reported as changes | PASS |
| Restoring rolls the recipe back, including removing a line the edit added | PASS |
| **The restore is itself a version, and the version rolled back from survives** | PASS |
| The note survived the edit and the restore | PASS |
| A note can be deleted; the history is unaffected | PASS |

The two emphasised rows are the ones that make the feature trustworthy rather
than merely present. The baseline is what makes a recipe's *first* change
undoable — without it the original version of everything predating this feature
would be unrecoverable, which is precisely the version someone wants back after
a change goes wrong. And recording the restore rather than deleting later
versions is what makes the second undo possible: the one that puts back what you
had before you panicked.

### 3.2 Responsive layout — 19 assertions across three widths, all passed

| | phone 390 | tablet 768 | laptop 1440 |
| --- | --- | --- | --- |
| Browse page horizontal overflow | 0 px | 0 px | 0 px |
| Recipe page overflow, log closed | 0 px | 0 px | 0 px |
| Recipe page overflow, log open | 0 px | 0 px | 0 px |
| Recipe column width, closed | 358 px | 672 px | 672 px |
| Log placement when open | below | below | **beside** |
| Recipe width beside the panel | — | — | 624 px |
| Smallest log control | 34 px tall | — | — |

Horizontal overflow is measured as `scrollWidth − clientWidth` on the document
element, which catches the real failure — a page that scrolls sideways on a
phone — rather than merely checking that a breakpoint class is present.

The recipe column stays at the same 672 px measure whether the panel is open or
closed, rather than stretching to fill the space the panel vacates. Reading
length is a property of the text, not of the window.

The 24 px floor on tap targets is below the 44 px Apple guideline and is
deliberately a floor rather than a target: it catches a control that is
accidentally tiny, which is the defect worth failing a build over.

### 3.3 A failed model call — 8 assertions, all passed

Run with `ANTHROPIC_API_KEY` set to an invalid value, so the request reaches the
API and is genuinely rejected.

| Assertion | Result |
| --- | --- |
| **Ask Claude** appears alongside the free **Note it** | PASS |
| The panel states that changes are reversible *before* one is made | PASS |
| The failure is reported in the panel, in words | PASS |
| **The cook's message survived the failed call** | PASS |
| It is labelled as something they said, not as a note | PASS |
| The recipe body is untouched | PASS |
| **No version was recorded for a call that failed** | PASS |

The message surviving is the guarantee that matters most here. A note is the one
thing in this feature that cannot be reconstructed — the recipe can be re-edited
and the model can be re-asked, but what someone thought while cooking is gone if
it is dropped. Writing the entry before the call, rather than after a successful
response, is what makes that hold.

---

## 4. Faults found and fixed during this phase

**A missing space, in the product.** The collapsed line rendered as `Notes(1)`.
JSX drops the newline between a text node and an adjacent expression, so
`Notes\n{count}` produces no separator. Fixed with an explicit `{" "}` and a
comment naming the cause. Found by a test whose regex expected a space — the
test was right and the markup was wrong, which is the direction one hopes for.

**Three faults in my own test harness**, each of which first looked like a
product bug:

1. `form button[type=submit]` matched the header's **Sign out** button, which is
   earlier in the DOM, so the harness signed itself out mid-run. This is the
   *second* time this exact selector has done this in this project; every submit
   is now scoped to `main`.
2. `waitForURL(/chat=1/)` after submitting from a page whose URL already
   contained `chat=1` returned immediately and proved nothing, so assertions ran
   against the pre-submit render. Replaced with waits on the content itself.
3. A recipe left behind by the previous run meant the new one was created as
   `butter-loaf-3` while the hard-coded URLs still addressed `butter-loaf`. The
   harness now derives the slug from the URL it actually landed on.

**The migration trap, for the second time.** `prisma migrate diff` again emitted
`DROP INDEX "Ingredient_name_trgm_idx"` as the first statement, because the
trigram index is hand-written and invisible to Prisma. Removed by hand, and the
migration now carries an explicit warning naming the recurrence. The index was
confirmed present in `pg_indexes` after the migration ran.

**A corrupted local database.** The PGlite data directory was left unclean by a
killed process, and PGlite's WASM build aborts on startup rather than running
crash recovery. Recovered by recreating the fixture database. Worth recording
because the failure mode is opaque — `RuntimeError: Aborted()` with no mention
of recovery — and because deleting `postmaster.pid` alone does not fix it.

---

## 5. Not covered

**The Claude revision itself.** No Anthropic API key was available, so the whole
of `lib/ai/revise.ts` beyond its failure path is unverified against the live
service: whether the model returns a complete ingredient list, whether the
summary is usable as a history line, whether the "change nothing else"
instruction holds, and whether the empty-list guard ever fires in practice.

What *is* verified is everything around it: the message is recorded before the
call, a failure records no version, the schema rejects malformed answers, and
any change it does make is a snapshot away from being undone.

**Concurrent revisions.** Revision numbers come from a count inside the same
request, with a unique constraint on `(recipeId, number)` as the backstop. Two
simultaneous writes to one recipe would make one of them fail the constraint
rather than silently interleave. On a single-owner deployment this is a race
between two of the owner's own tabs, so it was left as a constraint violation
rather than given a retry loop — but it is untested, and a multi-user fork would
need to revisit it.

**Very long histories.** The history page loads every revision and diffs each
against its predecessor. At the scale of a personal collection this is a handful
of rows per recipe; a recipe revised hundreds of times would want pagination.

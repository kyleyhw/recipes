# The recipe log and its history

A recipe is not finished when it is written. It is cooked, found wanting, and
adjusted — and the reason for each adjustment outlives the adjustment itself.
"The crumb was dry at 180 g of butter" is what makes the *next* change an
informed one, and is exactly what is lost when a recipe is simply edited in
place.

This is the feature that records both: what you thought, and what it did to the
recipe.

---

## 1. The log

Every recipe has one, reached from a single line on the recipe page and closed
by default. It holds three kinds of entry, in one chronological series:

| Kind | Written by | Costs |
| --- | --- | --- |
| `NOTE` | you, with **Note it** | nothing |
| `MESSAGE` | you, with **Ask Claude** | one model call |
| `REPLY` | Claude | — |

One table rather than two, because "needed more butter" and the change it caused
belong next to each other rather than in separate lists. An entry that changed
the recipe points at the revision it caused, which is what lets the history show
*why* a version exists rather than only that it does.

### Notes are free

**Note it** writes what you typed and does nothing else — no model call, no
cost, no change to the recipe. Most of what a cook wants to record is not an
instruction ("made it with half the chilli, better"), and a log where every
entry cost money would be a log nobody kept.

The two buttons share one textarea because the distinction is about what you
want *done*, not about what you are writing.

### Messages change the recipe

**Ask Claude** sends the message, along with the recipe and the recent log, and
applies whatever it decides to change. Applied, not previewed: this is used
standing at a counter with one hand, and a two-step accept flow is friction at
exactly the wrong moment. It is safe because it is reversible — every version is
kept, and the previous one is one click away.

The substitution page keeps its preview, because the question there is "what
would this do?" rather than "do this".

**The message is written to the log before the call.** A failure — no key, over
budget, unreachable — still leaves your own words recorded. Losing a note
because a remote service was down would be the worst failure this feature could
have: the note is the part that cannot be reconstructed.

### What Claude is told

`lib/ai/revise.ts` sends the recipe, the recent log, and the standing memories,
with instructions that matter more than they look:

- **A correction from having cooked it outranks the recipe.** They have made it;
  the model has not.
- **Change what follows, and what that forces.** More butter may mean a longer
  bake. Change the bake too, and say so.
- **Change nothing else.** An unrequested improvement to a recipe someone is
  cooking from is worse than no change at all.
- **A question is not an instruction.** Answer it and leave the recipe alone.

The reply returns the *complete* new ingredient list and method rather than
targeted edits, because "more butter" can require rebalancing several lines at
once and a set of independent edits invites a half-applied recipe. The cost of
that choice is that a careless answer could drop a line silently, which is why:

- an empty list is refused outright rather than applied;
- the model's claim that it changed something is checked against whether the
  text actually differs, so no empty version is ever recorded;
- and every version is recoverable.

---

## 2. The history

Every change writes a **complete snapshot** of the recipe — not a diff.

A diff chain is smaller and has to be replayed from the beginning to reconstruct
any version, so one corrupted link destroys everything after it. A snapshot is
restorable on its own. Recipes are a few kilobytes and are revised a handful of
times, so the storage argument for diffs does not apply here.

Diffs are still what you *read*: the history renders each version against the
one before it, computed at display time by a longest-common-subsequence diff
(`lib/ai/diff.ts`). That is a display concern, and a corrupted row costs you that
one version rather than the whole series.

### The baseline

Before the first recorded change to a recipe, an extra `INITIAL` revision is
written capturing the state the recipe had *when that change began*.

Without it, the original version of every recipe predating this feature would be
unrecoverable — and that is precisely the version a cook is most likely to want
back after a change goes wrong.

### What is recorded

| `source` | Written when |
| --- | --- |
| `INITIAL` | the baseline, before a recipe's first recorded change |
| `CHAT` | Claude acted on a message in the log |
| `EDIT` | the editor saved, or a substitution was applied |
| `RESTORE` | an earlier version was rolled back to |

### Restoring

Restoring writes a **new** revision rather than deleting the ones after it.
History is append-only: undoing a mistake must not destroy the record of it, or
the second undo — the one that puts back what you had before you panicked —
becomes impossible.

The snapshot goes back through `updateRecipe`, so ingredient text is re-parsed
and re-resolved exactly as for a hand edit. This is why snapshots store the text
a person typed rather than parsed rows: a restored recipe is indistinguishable
from a typed one, and any later improvement to the parser reaches it.

### Deleting a note

Notes are your own words and can be deleted. The revision one produced survives:
the history is the record of what the recipe *was*, and that is not rewritten by
tidying a note.

---

## 3. What does not travel

The log and the history are **local**. They are not in the sharing bundle, not
in the exports, and not on the public share page.

They are a record of one person's cooking in one kitchen — half of it is
addressed to a model, and the rest is unedited thinking. What travels is the
recipe, the resolved nutrition, and the original source; what stays is how you
got there.

The one piece of provenance that *does* travel is `sourceUrl`. See
[sharing-format.md](sharing-format.md).

# Data model

The full schema is in [`prisma/schema.prisma`](../prisma/schema.prisma). This
document records the reasoning behind the choices that are not self-evident.

## Whole schema, one migration

Every model — including `Tag` and `AiInteraction`, which no code uses until
phases 2 and 7 — is declared in the initial migration. Adding two unused tables
costs nothing; a destructive migration halfway through the build costs real
work, and a self-hoster who deployed early would inherit it.

## `Recipe`

`baseServings` is the serving count the stored quantities correspond to — the
$S$ that per-serving macros are divided by.
Scaling never mutates it: scaling is a *view*, and a recipe scaled to eight
servings and back to four must be bit-identical to where it started. Saving a
scaled copy is an explicit, separate action.

`servingLabel` exists because "4 servings" is wrong for a batch of cookies. It
affects display only.

`shareId` is null until the recipe is shared, and nulling it revokes every
circulated link at once. It is separate from `id` so that sharing one recipe
never exposes an internal identifier that could be used to probe for others.

`photoCandidates` stores the runner-up results from the last photo search so
that "replace photo" costs nothing. Without it, rejecting a bad automatic pick
would trigger a second billable model call.

## `RecipeIngredient`

**`rawText` is never discarded.** It holds the line exactly as typed or
imported — `"1 large onion, finely diced"`. Everything else on the row
(`quantity`, `unit`, `name`, `prepNote`) is a *parse* of it, and the resolved
`ingredientId` is a further inference on top of that parse. Both can be wrong.
Keeping the original means a bad parse degrades the macro estimate but never
the recipe: the cook still reads the line they wrote. The cost is one text
column per ingredient, which is nothing against the alternative of a recipe
that has been silently corrupted by a parser.

**`scalable`** marks quantities that must not be multiplied by $\alpha$: "salt
to taste", "oil for frying". Multiplying them produces confident nonsense.

**`gramsOverride`** bypasses unit conversion entirely, for cases where the
density $\rho$ or per-item mass $\mu$ is unknown or wrong for this particular
use.

**`ingredientId` may be null**, and null is meaningful: the ingredient is
*unresolved*, contributing nothing to the macro totals *and* being reported as
a coverage gap. It is never treated as nutritionally zero. The distinction
between "contains no fat" and "we do not know its fat content" is the whole
point of the coverage metric.

## `Ingredient`

Canonical and shared across every recipe that references it. This is the
load-bearing decision of the nutrition design:

- Resolving "unsalted butter" against USDA once makes every recipe using it
  accurate at once.
- A manual correction propagates everywhere, rather than needing to be repeated
  per recipe.
- Mass coverage becomes comparable across recipes, because the same ingredient
  means the same thing everywhere.

The alternative — per-recipe nutrition rows — would require correcting the same
error repeatedly and would make coverage figures incommensurable.

Macros are stored **per 100 g**, which is the USDA convention and makes
aggregation a plain linear combination with no per-row unit handling.

`densityGPerMl` ($\rho$) and `gramsPerUnit` ($\mu$) live here rather than in
`units.ts` because they are properties of the *substance*, not of the unit: a
millilitre of flour and a millilitre of honey differ, and no table keyed on
"ml" can express that. Where either is unknown, the conversion is undefined and
the ingredient is reported as a coverage gap rather than being assigned a
plausible default — a default here would be indistinguishable from real data in
the totals.

`sourceNote` records where a number came from, satisfying the magic-number
standard for values like flour's $\rho \approx 0.53\ \mathrm{g\,ml^{-1}}$.

### What an ingredient rules out

`excludes` is a list of tags — `meat`, `pork`, `fish`, `shellfish`, `dairy`,
`egg`, `peanut`, `nuts`, `sesame`, `soy`, `gluten`, `alcohol` — saying what the
substance carries. Absent means it carries none, which is the answer for most of
the library.

The tags are about the **substance**, never about a diet: a row says `pork`, not
`not-halal`. The diets are assembled from them in `lib/content/diet.ts`, so
"vegetarian" is defined once rather than restated on 166 rows, and adding a diet
is a line in that file rather than a pass over the library.

A recipe's diets are then **derived at build time** from its ingredients. No
recipe file carries a `vegetarian: true` field, because a field like that is a
claim somebody typed once and nobody checks again — add oyster sauce to a
stir-fry two months later and the field still says vegetarian. This way the
answer changes when the ingredient list does, which is the only version that
stays true. It is also what catches the traps: dashi is a fish stock, oyster
sauce is shellfish, gelatine is boiled from hide, and Parmigiano Reggiano is
made with calf rennet, none of which is visible in a recipe's title.

An unresolved ingredient line makes a recipe satisfy **no** diet rather than all
of them. The absence of evidence about an ingredient is not evidence that the
ingredient is fine, and a filter that treated it as such would hide exactly the
recipe somebody needed to check by hand.

None of this is an allergen guarantee, and the site says so wherever it shows
one. It reads a Markdown ingredient list, not a label: brands differ, factories
are invisible to it, and an accompaniment a final step names — rice, toast — is
not on the list at all.

### Reading $\mu$ backwards

$\mu$ exists so a count can become a mass — "2 eggs" is 100 g only because a
row says an egg is 50 g. `unitName` is what makes the inverse readable. Given a
line's mass $g$, the page shows

$$n = \operatorname{round}_{1/2}\!\left(\frac{g}{\mu}\right)$$

items, named by `unitName` (pluralised by `unitNamePlural` where an -s is
wrong). The rounding is to halves below three and to whole numbers above it,
because the output is an instruction about physical objects rather than a
measurement: kitchen equipment realises eighths, vegetables do not. Below a
quarter of an item nothing is shown at all, and a figure the rounding moved by
more than a tenth is marked *about*. See `lib/count.ts`.

`unitName` is opt-in per row rather than derived from the name, because English
pluralisation is not derivable — a rule that singularises "bird's eye chillies"
produces "1 bird's eye chillie" on every recipe that uses one.

`madeUp` is the same idea for a liquid nobody brews from scratch. It holds a
rate — millilitres of finished liquid one sachet or cube makes — so a line
asking for 900 ml of dashi can say how many packets and how much water, and can
keep saying it correctly when the recipe is scaled. Its `note` carries what the
arithmetic cannot: an Oxo cube is 190 ml where a Knorr one is 500, and a row
that quoted only the number would silently mean one of them.

## `RecipeEntry` and `RecipeRevision`

The per-recipe log and its history, added in phase 8 and documented in full in
[log-and-history.md](log-and-history.md).

`RecipeEntry` is one table for three kinds of line — a note, a message to
Claude, its reply — because "needed more butter" and the change it caused belong
next to each other rather than in separate lists. An entry that changed the
recipe carries `revisionId`, which is what lets the history show *why* a version
exists rather than only that it does.

`RecipeRevision.snapshot` stores a **complete** recipe, not a diff against the
previous one. A diff chain has to be replayed from the beginning to reconstruct
any version, so one corrupted link destroys everything after it; a snapshot is
restorable on its own. Recipes are a few kilobytes and are revised a handful of
times, so the storage argument for diffs does not apply. Diffs are still what is
displayed — computed at render time, where being wrong costs a confusing screen
rather than a lost recipe.

The snapshot carries category and tag *names* and ingredients as **text**, for
the same reason the sharing bundle does: restoring then runs the ordinary edit
path, re-parsing and re-resolving, so a restored recipe is indistinguishable
from a typed one and later parser improvements reach it.

## `AiInteraction`

Records token counts *and* a `costUsd` snapshot priced at call time. The
snapshot is stored rather than recomputed because published prices change, and
recomputing would silently rewrite historical spend. `webSearchRequests` is
separate because server-side web search is billed per search, not per token.

## Indexes not expressible in Prisma

Three are appended to the initial migration by hand:

- `Recipe_fts_idx` and `RecipeIngredient_fts_idx` — GIN indexes over
  `to_tsvector('english', ...)`. The two-argument form with a literal
  regconfig is `IMMUTABLE` and therefore indexable; the one-argument form
  depends on a session GUC and is not.
- `Ingredient_name_trgm_idx` — a trigram index for fuzzy matching free-text
  ingredient names against the canonical library. Exact and prefix matching
  alone miss plurals, spelling variants, and word order (`"butter, unsalted"`
  against `"unsalted butter"`).

# Test report — Phase 5: Macros and export

**Date:** 2026-08-10
**Scope:** macro aggregation, mass coverage, USDA client, ingredient resolution, the
canonical ingredient library, and the four export formats.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Full unit suite (159 tests, 9 files) | ~1.5 s |
| `nutrition-compute.test.ts` (21 tests) | 9 ms |
| Macro + export browser flow (21 assertions) | ~25 s |

---

## 1. The scaling invariant as a test

$\mathbf{M}_\text{serving}$ is invariant under portion scaling, because $g_i \mapsto \alpha g_i$
and $S \mapsto \alpha S$ together. This is an exact algebraic identity, which makes it an
unusually good test: it requires **no hand-computed expected value at all**. A test that
depends on hand-computed values tests the author's arithmetic as much as the code; this
one cannot.

It is asserted at $\alpha \in \{0.5, 1, 2, 3.7\}$. The value 3.7 is chosen deliberately as
non-dyadic and non-integer, since dyadic factors can mask errors that happen to land on
exactly representable values.

It is also asserted **on a partially-resolved recipe**, which is the realistic case: the
invariant must survive an unmatched ingredient, and so must the coverage figure.

And it is asserted again **in the running system**, through the JSON export: per-serving
kcal at 4 servings and at 8 servings both read 345.1, while totals scale linearly.

## 2. Coverage is mass-weighted

The test that justifies the whole design compares two recipes:

- 500 g flour unmatched, 5 g salt matched → coverage 5/505 ≈ **1%**
- 500 g flour matched, 5 g salt unmatched → coverage 500/505 ≈ **99%**

A count-based metric reports "1 of 2 matched" for both. They are not remotely equivalent,
and presenting them identically is precisely the failure this subsystem exists to prevent.

The circularity in the denominator — computing total mass requires the mass of ingredients
we could not resolve — is tested explicitly. Ingredients whose *mass* is undeterminable are
excluded from the denominator and reported as a separate count, because entering them
would require inventing a figure.

## 3. Hand-checked arithmetic

One test computes a total by hand and compares:

```
200 g flour @ 364 kcal/100g   = 728.0
2 eggs @ 50 g each @ 143      = 143.0
1 cup milk @ 1.03 g/ml @ 61   = 150.8   (240 ml × 1.03 = 247.2 g)
50 g butter @ 717             = 358.5
                                ------
                                1380.3
```

The application returned **1380.3**. This exercises the full chain — parsing, resolution
against the seeded library, unit conversion through ρ and μ, and aggregation — in one
figure, using three different conversion paths (mass, count via μ, volume via ρ).

## 4. Export formats

| Assertion | Why it matters |
| --- | --- |
| JSON-LD is a `Recipe` with `NutritionInformation` | This is the format third-party importers parse; a wrong `@type` makes it invisible |
| JSON-LD values carry units (`"345 kcal"`, `"10.4 g"`) | schema.org types these as strings with units, not numbers. Emitting bare numbers is a spec violation that importers silently drop |
| CSV has a row per ingredient, including unresolved ones | A spreadsheet showing 4 of 5 ingredients would silently misstate the recipe. Unresolved rows appear with empty macro cells and a `unresolved` status |
| Tracker text states its coverage caveat | The consumer of this format is a human pasting into MyFitnessPal; the caveat has to travel with the numbers |
| Every format honours `?servings=N` | What is exported must be what is being cooked |
| Coverage exported alongside the figures | A tracker that ignores it is no worse off; one that reads it can warn |

## 5. Ingredient library

The correction test is end-to-end and is the argument for a *shared canonical* library:
editing all-purpose flour from 364 to 400 kcal/100 g in the library changed the recipe's
total from 1380.3 to 1452.3 without touching the recipe. The edited row is marked `MANUAL`,
which is what protects it from a later automatic pass — an owner who has corrected a figure
has more authority than any database.

**Seeded starter library.** 22 ingredients with USDA-sourced macros, densities (ρ) and
per-item masses (μ), each carrying a `sourceNote` naming its FDC id. This exists so a fresh
deployment computes real macros with **no `USDA_API_KEY` configured at all**, which is what
makes the optional-key claim in the self-hosting docs true rather than aspirational.

---

## 6. Not covered

- **The USDA client has never contacted USDA.** No API key is available in this
  environment. The client is written, typed, and wired, and its failure paths return empty
  rather than throwing — but the success path is unexercised, and the nutrient-id mapping
  in particular is reasoned from the FDC schema rather than verified against a response.
  This is the largest untested surface in the project.
- **Trigram resolution is untested against adversarial names.** The 0.45 threshold was
  chosen by trying the starter library against realistic lines; no systematic evaluation of
  false matches was done. A wrong match here silently attaches the wrong nutrition data,
  which is why the threshold errs tight, but "errs tight" is a judgement, not a
  measurement.
- **Density figures carry real uncertainty.** Flour varies by roughly 15% between spooned
  and scooped. Every ρ is sourced in its comment, but no test can establish that a cup of
  the user's flour weighs 120 g. This is the argument for weighing, and the reason the
  gram override exists.
- **No test covers a recipe with 100+ ingredients** or the resolution loop's behaviour
  under a slow USDA response.

# Test report — Phase 4: Portion scaling

**Date:** 2026-08-10
**Scope:** unit conversion, constrained rational approximation, unit selection, scaling,
non-linearity advisories, servings stepper.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Full unit suite (138 tests, 8 files) | ~1.4 s |
| `units.test.ts` (16 tests) | 12 ms |
| `quantity.test.ts` (31 tests) | 21 ms |
| `scaling.test.ts` (16 tests) | 8 ms |
| Scaling browser flow (18 assertions) | ~20 s |

---

## 1. `units.test.ts` — conversion

**Why these inputs.** The central claim of §1 of the maths doc is that
within-dimension conversion is a group action: associative, invertible, and
path-independent. Those are properties, not examples, so the tests assert them over the
whole unit set rather than spot-checking pairs.

| Test | What it defends |
| --- | --- |
| Round-trip over **every** mass pair and **every** volume pair (16 + 81 conversions) | Invertibility to 1e-9 relative. A looser bound would hide real error; double precision over factors spanning 1 to 3785 loses far less than this |
| Path independence: cups → tbsp → ml vs cups → ml | The property that makes a star-shaped lookup table correct and a conversion *graph* unnecessary. A graph implementation would accumulate rounding along whichever path it searched |
| Documented factors asserted exactly | A silent change to any $\lambda_u$ shifts every macro figure in the application. 3 tsp = 1 tbsp and 16 tbsp = 1 cup are asserted as exact equalities, which they are by construction |
| Cross-dimension conversion returns null | Volume→mass is a property of the substance, not the units. It must fail here rather than guess |
| `toGrams` returns null, never a default, when ρ or μ is unknown | The single most important behaviour in the module. A default would be indistinguishable from real data in the totals, which is exactly what the coverage metric exists to expose |
| Zero and negative ρ rejected | Data corruption, not measurement; using it would silently produce a zero-mass ingredient |

## 2. `quantity.test.ts` — rendering

**The named case.** The maths doc argues that continued fractions are the wrong tool
because their convergents are optimal over *all* denominators. The test asserts this
concretely: `bestFraction(0.5385)` must not return 7/13 — the continued-fraction answer,
closer than anything in $D$ and unmeasurable — and must return ½.

**Density over examples.** A sweep of 994 values (0.07 to 10.00 in hundredths) asserts
that *no* output ever carries a denominator outside $D$. Spot-checking a dozen values
would not establish this; the constraint is the module's entire purpose.

**Boundary honesty.** `bestFraction` returns null below 1/16, where every candidate
numerator rounds to zero. That is the correct answer — no fraction in $D$ describes 0.01
of anything — and callers fall back to a decimal. The test asserts the boundary at 1/16
exactly rather than assuming a value.

## 3. `scaling.test.ts` — the scaling view

The round-trip test (scale to 10 servings, then back to 4) asserts the design claim that
scaling is a *view*: the operation must be exactly invertible, since the stored recipe is
never mutated.

The advisory threshold test asserts the reason for using $|\ln\alpha|$ rather than
$|\alpha - 1|$: halving and doubling are equally large multiplicative departures, and
only the logarithm treats them so.

---

## 4. Five design faults found by testing

Every one of these was a genuine fault in code or documentation, found because the tests
asserted what a cook would want rather than what the implementation happened to do.

| Fault | Symptom | Fix |
| --- | --- | --- |
| Rendering crossed measurement systems | `500 g` rendered as `1⅛ lb` — arithmetically right, wrong for a cook following a metric recipe with a metric scale out | Units carry a `system`; candidates are filtered to the system the recipe was written in |
| Metric rendered as fractions | `3.7 ml` rendered as `3⅔ ml` | Metric climbs the ladder to keep the value in [1, 1000) and renders decimals |
| "Largest unit" preferred fractions over whole numbers | `5 ml` → `⅓ tbsp` instead of `1 tsp`; `180 ml` → `6⅛ fl oz` instead of `¾ cup` | Comfortable range [¼, 4], then simplest denominator, ties to the larger unit |
| Fluid ounces chosen over the tsp/tbsp/cup ladder | `15 ml` → `½ fl oz` | `floz` marked input-only, like pints and gallons |
| Plural at exactly ¾ | `¾ cups` | Singular at or below one, which is how recipes are written |

**A documentation error, not a code error.** The maths doc asserted that 887 ml renders
as 3¾ cups. It does not: 887/240 = 3.696, whose nearest member of $D$ is 3⅔ at 0.79%
error against 1.46% for 3¾. The code was right and the document was wrong; the document
has been corrected and the correction recorded in place rather than quietly overwritten.

---

## 5. Browser verification — 18 assertions

All passed, against real PostgreSQL, Chromium at 390 × 844, on a pancake recipe
exercising mass, volume, count, leavening, and unscalable lines.

Covering: verbatim `rawText` at base size; 2× on all three dimensions; ¾ cup at 0.5×
rather than "0.75 cups"; unscalable passthrough with its flag; leavening, pan-size and
cook-time advisories appearing at 2× and *not* at 1.25×; the fractional-egg explanation;
stepper navigation and reset; and — importantly — that after all of this the **stored**
recipe still reads 4 servings and 250 g, confirming in the running system that scaling
never mutates.

A hostile `?servings=-5` was checked explicitly: it falls back to the base rather than
producing a negative scaling factor.

---

## 6. Not covered

- **No test asserts the advisory *text* is correct cooking advice.** The tests assert
  that an advisory fires for the right ingredient at the right threshold; whether the
  guidance is good is a judgement no test can make.
- **The non-linear ingredient list is a fixed set of patterns.** An ingredient outside it
  (malted barley, cream of tartar) scales linearly with no flag.
- **Fraction rendering is not tested against a screen reader.** Vulgar-fraction glyphs
  are announced inconsistently across assistive technologies, and no verification of that
  has been done.

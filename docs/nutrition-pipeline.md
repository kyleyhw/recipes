# Nutrition pipeline

How an ingredient line becomes a number on the macro panel, and how to read the
panel once it is there. The mathematics is derived in
[mathematics.md §3](mathematics.md#3-macronutrient-aggregation-and-coverage);
this document is the pipeline and its provenance rules.

```
rawText -> parse -> resolve to canonical Ingredient -> convert to grams -> aggregate
```

Each stage is a separate module, and each can fail independently without taking
the recipe with it. A recipe whose ingredients none resolve still stores,
scales, exports, and shares; it simply reports 0% coverage.

---

## 1. Parsing

`lib/ingredient-parser.ts` splits a line into quantity, unit, name, and
preparation note. It handles vulgar fractions (`½`), mixed numbers (`1 1/2`),
ranges (`2–3 tbsp`, taken at the midpoint), and a table of unit aliases.

Two flags come out of this stage and matter later:

- `optional` — set by a trailing `(optional)` or a leading `optionally`.
  Excluded from macro totals by default, includable on request.
- `scalable` — cleared for lines like `salt to taste` and `oil for frying`,
  which are quantities in name only. See
  [mathematics.md §2.4](mathematics.md).

`rawText` is never discarded. Everything above is a derived view over it, so a
parsing error degrades the macro panel rather than corrupting the recipe.

---

## 2. Resolution

`lib/nutrition/resolve.ts` maps a parsed ingredient name onto a row of the
canonical `Ingredient` table. The table is shared across every recipe, which is
the point: resolving *unsalted butter* once makes every recipe using it
accurate at once, and a correction propagates everywhere rather than needing to
be repeated.

The name is first normalised — lowercased, parenthetical asides removed,
preparation words (`finely`, `chopped`, `large`) dropped — because those words
describe what was done to an ingredient rather than what it is, and they defeat
both exact and fuzzy matching.

Resolution then proceeds cheapest-first, stopping at the first success:

| Order | Source | Cost | Notes |
| --- | --- | --- | --- |
| 1 | Local library, exact match | free | Case-insensitive. |
| 2 | Local library, trigram similarity | free | `pg_trgm` GIN index; threshold 0.45. |
| 3 | USDA FoodData Central search | free, network | Needs `USDA_API_KEY`. |
| 3b | Claude chooses among the USDA candidates | billable | Needs `ANTHROPIC_API_KEY`. |
| 4 | Claude estimates the composition | billable | Only when FDC has no record. |

**Why the trigram threshold is 0.45 and not the `pg_trgm` default of 0.3.** At
0.3, *salt* matches *shallot*. A wrong match is worse than no match: it attaches
plausible-looking macros that are wrong, in every recipe using the ingredient,
with nothing to indicate it. An unmatched ingredient is at least visible as a
coverage gap. The threshold errs tight for that reason, and was set by trying
the starter library against realistic ingredient lines.

**Why Claude chooses rather than taking the top USDA hit.** FDC's ranking is
lexical. Searching *butter* returns branded compound products above plain
unsalted butter; searching *flour* returns fortified bakery mixes. Choosing
among candidates is a judgement about food, and a ranking function is bad at it.
Claude is also asked for two numbers FDC does not record at all:

- $\rho$ (`densityGPerMl`) — grams per millilitre, as measured in a kitchen.
- $\mu$ (`gramsPerUnit`) — grams in one countable item.

Without them a cup or a count is unconvertible, so the ingredient's mass is
unknown and it cannot even enter the coverage denominator.

The model is explicitly permitted to reject every candidate. That answer is
taken seriously: rejection falls through to an estimate or to no match, never
back to the top hit, because otherwise the only judgement that was asked for
would be overridden the moment it was inconvenient.

**Every step after the second is optional.** With neither key configured,
resolution stops at the trigram search, unmatched ingredients are reported as
gaps, and the 22 seeded starter ingredients still cover a good deal of ordinary
cooking. This is deliberate degradation: a gap is visible, a fabricated figure
is not.

### Provenance

Every `Ingredient` carries a `source` and a `sourceNote`:

| `source` | Meaning |
| --- | --- |
| `USDA` | From FoodData Central. `sourceNote` names the FDC identifier. |
| `CLAUDE` | A model estimate. `sourceNote` records what it was based on. |
| `MANUAL` | Entered or corrected by the owner. |

`MANUAL` is never overwritten by an automatic pass. Someone who has weighed
their own flour has more authority than any database.

The distinction is preserved everywhere rather than averaged away. A measurement
and an estimate are not the same kind of number, and the owner is entitled to
know which one is behind a total.

---

## 3. Conversion to grams

`lib/units.ts`, per [mathematics.md §2](mathematics.md). Mass units convert by
their factor; volume needs $\rho$; count needs $\mu$. A `gramsOverride` on the
recipe ingredient bypasses all of it and always wins.

Where the conversion is undefined the function returns `null` — never a default.
A default here would be indistinguishable from a measurement in the output.

---

## 4. Aggregation

`lib/nutrition/compute.ts`, a pure function:

$$\mathbf{M} = \sum_i \frac{g_i}{100}\mathbf{m}_i, \qquad
\mathbf{M}_\text{serving} = \frac{\mathbf{M}}{S}.$$

Per-serving macros are invariant under portion scaling, which is asserted as a
property test rather than against hand-computed values.

---

## 5. Reading the macro panel

### The energy bar

A horizontal stacked bar, one segment per macronutrient, **weighted by energy
contribution rather than by mass**. The Atwater factors are

$$4\ \mathrm{kcal\,g^{-1}}\ \text{(protein)}, \quad
4\ \mathrm{kcal\,g^{-1}}\ \text{(carbohydrate)}, \quad
9\ \mathrm{kcal\,g^{-1}}\ \text{(fat)},$$

so a segment's width is $4p / (4p + 4c + 9f)$ for protein, and correspondingly
for the others. The three widths sum to 100%.

**How to read it, and why it is not mass-proportioned.** Equal masses of the
three macronutrients do not contribute equal energy: 10 g of each gives
40, 40, and 90 kcal, so fat is 53% of the energy from 33% of the mass. A
mass-proportioned bar would show three equal thirds and understate fat by more
than a factor of two. The bar answers "where do these calories come from", which
is the question a tracker is being fed the numbers to answer.

The bar has no axis because it has no scale: it is a composition, always full
width, and the absolute figures are printed beside it.

### Coverage

A percentage, mass-weighted:

$$c = \frac{\sum_{i \in R} g_i}{\sum_i g_i},$$

where $R$ is the resolved subset. **This is not a confidence score.** It says
what fraction of the food by mass has known nutrition, and nothing about how
accurate that nutrition is.

Mass-weighting is the whole point. A recipe with unmatched salt and a recipe
with unmatched flour have the same count of unmatched ingredients and are not
remotely comparable; the first reads 99%, the second 1%.

Two counts appear alongside it, and they exist because the denominator is
otherwise circular — an ingredient whose *mass* is unknown cannot be weighed
in a mass-weighted metric without inventing the figure:

- **mass unknown** — a volume or a count with no $\rho$ or $\mu$.
- **no quantity** — `salt to taste`.

Neither enters the ratio. Both are reported, because a coverage of 100% over
three of eight ingredients would otherwise read as completeness.

### Coverage, per nutrient

One coverage figure was enough while the table held four columns. It is not
enough now that it holds twenty.

Every entry in `content/ingredients.json` carries energy, protein, carbohydrate
and fat — the schema requires them. Only some carry zinc, and fewer carry
vitamin D. So a recipe can sit at 100% overall coverage and still have a zinc
figure derived from a third of its mass, because the two ingredients that
supply the other two thirds have no zinc column.

`computeNutrition` therefore returns `nutrientCoverage`: the same ratio,
computed separately for each nutrient, over the same denominator. That last
part matters — because the denominator is the whole determinable mass,
`nutrientCoverage.kcal` is exactly `coverage`, and the twenty figures are read
on one scale rather than twenty.

$$c_n = \frac{\sum_{i \in R_n} g_i}{\sum_i g_i},$$

where $R_n$ is the subset carrying a figure for nutrient $n$. Two consequences
the interface depends on:

- A total is a **lower bound** whenever $c_n < 1$, and $c_n$ says how much of
  one. The panel prints the mass share next to any nutrient below 90%.
- $c_n = 0$ with a total of zero means *unknown*; $c_n = 1$ with a total of zero
  means the recipe genuinely contains none. Without the coverage figure those
  two are the same number on the screen.

### Reference intakes

A micronutrient in milligrams is unreadable to almost everyone, so each figure
is shown against a daily reference intake as well. The references are the EU
values in Regulation (EU) No 1169/2011, Annex XIII — the same schedule used on
British and European packaging, so a percentage here means what a percentage on
a packet means.

Two exceptions, both marked in `lib/nutrition/nutrients.ts`: fibre, which Annex
XIII does not set and which takes the SACN (2015) figure of 30 g, and
cholesterol, which has no reference anywhere and so shows no percentage rather
than a fabricated one.

A reference intake is a labelling convention for an average adult. It is used
here for scale, which is all it is good for.

### What a gap is not

An unresolved ingredient contributes zero to the totals and is displayed as a
gap, never as a nutritional zero. "Contains no fat" and "we do not know its fat
content" are different claims, and keeping them distinct is the reason this
metric exists at all.

---

## 6. Export

The figures leave through `lib/export/formats.ts` in four shapes — JSON,
schema.org JSON-LD, CSV, and a plaintext block for tracker import. Unresolved
ingredients appear in the CSV with empty cells rather than being dropped, so the
export is a faithful record of what is and is not known.

Three of the four carry the whole table. The JSON export includes every
nutrient per serving and in total, plus `nutrientCoverage` and a `units` map so
a consumer needs no out-of-band knowledge of what `folateUg` is measured in. The
CSV has one column per nutrient and a final `COVERAGE` row beneath the totals.
The plaintext block prints only the nutrients with data, noting the mass share
where it is partial.

JSON-LD is the exception, and deliberately. `NutritionInformation` defines
properties for energy, the macros, saturates, fibre, sugars, cholesterol and
sodium, and for nothing else — there is no `zincContent` in the vocabulary.
Inventing one would produce a document that still validates as a Recipe while
carrying fields no importer reads, so the vitamins and minerals are simply
absent from that format.

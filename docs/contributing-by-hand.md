# Writing a recipe by hand

[CONTRIBUTING.md](../CONTRIBUTING.md) is the short path, and it assumes you are
handing the writing to a model. This is the same ground for a person typing it
themselves — every section of the file, every field, and what each one is for.

A recipe is one file: `content/recipes/<slug>.md`. The filename becomes the URL,
so `chilli-garlic-noodles.md` is `/recipes/chilli-garlic-noodles/`. Lower case,
hyphens, no spaces.

**Two files is the whole of it** — that Markdown file, and a row in
`content/ingredients.json` for anything the library does not already have.
Nothing else needs touching: the photograph, the nutrition panel, the
attribution and the diagram table are all generated.

Two things to have open beside this:

- **[recipe-template.md](recipe-template.md)** — a complete file and a complete
  ingredient row, to copy and overwrite.
- **`npm run validate`** — reads the real `content/` directory and says in
  sentences what is wrong with it, naming the file, the line, and where it can,
  the library row you probably meant. It runs on your pull request too, and puts
  each problem on the line that caused it in the diff, so it works even if you
  never clone anything.

```
content/recipes/chilli-garlic-noodles.md
  line 11  Nothing in the ingredient library matches "soy sauce", so it will be
           missing from the nutrition panel.
           Did you mean "light soy sauce", "dark soy sauce"? If not, add a row
           for it to content/ingredients.json.
```

---

## The shape of the file

```markdown
---
title: Chilli Garlic Noodles
description: One line. What the dish is, and why you would make it.
category: Mains
cuisine: Chinese
tags:
  - quick
servings: 2
prepMinutes: 10
cookMinutes: 10
---

## Ingredients

- 200 g dried rice noodles
- 4 cloves garlic, minced

## Method

1. Bring 2 litres of water to a rolling boil.

## Notes

Free prose. Variations, warnings, what to look out for.

## Storage

How long it keeps, in what, and how to bring it back.

## Diagram

- toss
  - boil 4 min
    - dried rice noodles
  - fry 60 s
    - garlic

## Log

- 2026-08-17: Needed more salt.
```

Only `title`, `category` and `servings` are required by the parser. Everything
below is what makes a recipe good rather than merely valid.

---

## Front matter, field by field

| Field | Notes |
| --- | --- |
| `title` | As you would say it out loud. Title case. |
| `description` | One sentence, shown on the card and under the title. Say what it *is*, not that it is delicious. |
| `category` | Must match one in `content/categories.json`, or the recipe appears on no shelf. Mains, Sides, Desserts, Baked Goods, Breakfast, Soups & Stews, Sauces & Condiments, Drinks, Snacks. |
| `cuisine` | Whose food it is. Free text, and it is what the cuisine filter offers. Be as specific as the dish honestly allows — `Cantonese` rather than `Chinese` for a dish that is one, and `Chinese` where it is genuinely pan-regional or you are not sure. |
| `tags` | Cross-cutting labels a category cannot express: `quick`, `one pot`, `freezes well`, `make ahead`. |
| `servings` | The number the quantities below are written for. Everything scales from it. |
| `servingLabel` | What one serving is called, where "serving" is wrong: `slice`, `bowl`, `spoonful`. |
| `prepMinutes` / `cookMinutes` | Hands-on time, and time at the stove. Neither includes waiting. |
| `cookLabel` | The verb for `cookMinutes`: `bake`, `simmer`, `steam`, `roast`, `fry`. Defaults to `bake` when a tin is set and `cook` otherwise. |
| `waitMinutes` | Time the recipe takes while you are not in the kitchen: chilling, proving, marinating, drying, resting. It is counted in the total the card advertises, because a pudding that needs four hours in the fridge is a four-hour pudding to anyone deciding what to make tonight. Count only waiting that makes you wait — a marinade that sits while something else simmers costs no wall-clock time and belongs in the method alone. |
| — | **Sourcing.** An ingredient belongs in the list if an ordinary supermarket or Asian supermarket sells it. Whether `content/ingredients.json` already has a row is not the test — add the row. Ready-made packets (curry roux, suan cai yu kits, hot pot base) count as ingredients and should be used where that is what people actually cook with. |
| `waitLabel` | The verb for `waitMinutes`: `chill`, `prove`, `marinate`, `dry`, `soak`, `rest`, `set`, `cool`. Defaults to `chill`. |
| `source` | The address a web recipe came from. A recipe from a person goes in the Notes instead. |
| `tin` | Required for anything baked. `shape` is `round`, `square`, `rectangular` or `loaf`, with `diameter` or `length`/`width`, and `depth`, in centimetres. |
| `draft` | `true` while it is a proposal nobody has cooked. It shows a banner saying so. |

There is no `addedBy` field and there must not be one: the site takes that from
the commit that adds the file. See
[`src/lib/content/attribution.ts`](../src/lib/content/attribution.ts).

---

## Ingredients

One per line, `<quantity> <unit> <name>, <preparation>`.

```markdown
- 250 g fatty pork mince
- 6 cloves garlic, minced
- 60 ml lime juice (2 limes)
- 1 tsp salt
- salt to taste
```

- **Weigh things.** Grams beat cups: they scale exactly and they resolve to
  nutrition without a density.
- **The name must match a row in `content/ingredients.json`** — see below. The
  match ignores preparation words and anything in brackets, so
  `6 cloves garlic, minced` finds `garlic`.
- **Brackets are for the reader**: `60 ml lime juice (2 limes)` says how many
  limes to buy. Never put one on an ingredient the diagram splits, because the
  bracket describes the whole and each part would print it.
- **`salt to taste` and `oil for frying` are left alone by scaling**, because
  multiplying them produces confident nonsense. Write them exactly that way and
  the parser recognises them.

### Adding an ingredient to the library

If a recipe uses something the library does not have, add a row to
`content/ingredients.json`. A missing row does not fail the build — it quietly
drops that ingredient out of the nutrition panel — so this is the step that
gets forgotten. `npm test` fails if any ingredient line matches nothing, which
is the backstop.

```json
{
  "name": "fatty pork mince",
  "usdaFdcId": "168333",
  "kcal100g": 170,
  "protein100g": 19.5,
  "carbs100g": 0,
  "fat100g": 10.0,
  "sodiumMg100g": 65,
  "densityGPerMl": null,
  "gramsPerUnit": null,
  "excludes": ["meat", "pork"],
  "source": "USDA",
  "sourceNote": "Interpolated between USDA SR Legacy 168318 and 168333 to 10% fat.",
  "keeping": "Two days in the fridge. Freeze it flat in a bag for 3 months."
}
```

- **Per 100 g, always**, whatever unit the recipe uses. The four energy-bearing
  figures are required; everything else is optional, and absent means *unknown*
  rather than zero.
- **`sourceNote` is required in practice.** Every figure is a magic number and
  has to be traceable: USDA FoodData Central where it exists, a jar label where
  it does not, and say which. If a figure is a guess, say that it is a guess.
- **`densityGPerMl`** where the ingredient is measured by volume, and
  **`gramsPerUnit`** where it is measured by count. Without them a tablespoon
  or a clove cannot be weighed, and the ingredient becomes a coverage gap.
- **`unitName`** is what one `gramsPerUnit` is *called* — `clove`, `head`,
  `sheet`, `portion`, `tin`. It is what turns mu round the other way: with it,
  a line reading `400 g white cabbage` shows `(about 1 head)`, derived every
  build and correct at every serving count. Add **`unitNamePlural`** only where
  an -s is wrong: `leaf` → `leaves`, `chilli` → `chillies`.
- **`excludes`** is what the ingredient rules out, for the dietary filters:
  `meat`, `pork`, `fish`, `shellfish`, `dairy`, `egg`, `peanut`, `nuts`,
  `sesame`, `soy`, `gluten`, `alcohol`. Most rows need none — vegetables,
  spices, sugar, water. The ones worth thinking about are the ones nobody sees
  coming: **dashi is a fish stock**, oyster sauce is shellfish, gelatine is
  boiled from hide, soy sauce is brewed with wheat, Parmigiano Reggiano is made
  with calf rennet, and crisp chilli oil has peanuts in it. Anything porcine
  carries `pork` *and* `meat`. Where a tag depends on the brand, take the common
  case and say so in the `sourceNote` — none of this is an allergen guarantee
  and the site says as much wherever it shows one.
- **`madeUp`** for a liquid reconstituted from a packet rather than bought:
  `{"unitName": "sachet", "perMl": 500, "note": "…"}` says how far one goes, so
  a recipe asking for 600 ml of dashi can print how many packets and how much
  water, and keep printing it correctly when the recipe is scaled. Needs a
  `densityGPerMl`.
- **`keeping`** for anything perishable: how to store what the recipe does not
  use. A place, a time, and the trick that extends it.

---

## Method

Numbered. One action per step.

The house standard, in full, is in
[`content/memories.md`](../content/memories.md). The short version:

- **Numbers, not adjectives.** 28 cm pan, medium-high heat, 4 minutes, 175 °C.
- **Every step that ends says how to tell.** "Until the foam falls back and it
  smells of toffee", not "until browned".
- **No hedging.** Never "about", "or so", or "until done".
- **Say why where it is not obvious.** One clause: "adding it off the heat is
  the point — boiled vinegar loses its sharpness."

## Notes and Storage

**Notes** is free prose: variations, what to buy, what goes wrong, what to do
with the half tin left over.

**Storage** is not optional. How long it keeps and in what, whether it freezes
and how to defrost it, how to bring it back without ruining it. Where a dish
genuinely must be eaten at once, say that — it is the same question, answered.

Both render as **plain text, not Markdown**. A `**bold**` shows its asterisks
and a `[link](to.md)` shows its brackets. Refer to another recipe by its title.

## Diagram

The method as an indented tree. It is the part with a real grammar, and it has
its own document: [diagram.md](diagram.md).

## Log

Dated lines, newest last, in the order they happened.

```markdown
## Log

- 2026-08-17: Needed more salt — went up to 1½ tsp.
```

It is a cook's log, and it is public.

---

## Before you open the pull request

```bash
npm run validate  # the content, in sentences, with the file and the line
npm run check     # the above, plus typecheck, lint, format and the tests
npm run dev       # then look at the recipe page, and at its diagram
```

`npm run validate` is the one to run while you are writing: it reads the real
`content/` directory and reports broken front matter, a category that does not
exist, an ingredient matching no library row (with the row you probably meant),
a diagram whose shares do not add up or that has forgotten an ingredient, a
missing Storage section, and a library row with no `sourceNote` or a stub
`keeping` note. `npm run validate -- content/recipes/your-file.md` checks one
file, and `npm run validate -- --write` rewrites files into the collection's
canonical form, which is the one problem it can fix for you.

**You do not need a checkout.** The same validation runs on your pull request
and annotates the diff, so a recipe added through the GitHub web interface gets
the same messages on the same lines.

`npm run check` runs it first and then everything else.

What it cannot check is whether the diagram is *right*, whether the steps are
unambiguous, and whether the seasoning is enough. Open the page and read the
diagram against your own method before you call it done.

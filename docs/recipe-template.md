# A recipe file to copy

Copy everything between the rules below into `content/recipes/<your-slug>.md`
and replace it. The slug becomes the URL, so `chilli-garlic-noodles.md` is
`/recipes/chilli-garlic-noodles/` — lower case, hyphens, no spaces.

Then run `npm run validate`, which will tell you in sentences what is still
wrong with it. Every field and every section is explained in
[contributing-by-hand.md](contributing-by-hand.md); the diagram has its own
document in [diagram.md](diagram.md).

Only `title`, `category` and `servings` are required. Delete any line you do
not need — an empty field is worse than a missing one.

---

```markdown
---
title: Chilli Garlic Noodles
description: One sentence. What the dish is and why you would make it, not that it is delicious.
category: Mains
cuisine: Sichuan
tags:
  - quick
  - one pot
servings: 2
servingLabel: bowl
prepMinutes: 10
cookMinutes: 8
cookLabel: fry
waitMinutes: 30
waitLabel: chill
source: https://example.com/where-this-came-from
---

## Ingredients

- 200 g dried wheat noodles
- 20 g garlic, finely chopped
- 2 tbsp chilli oil
- 1 tbsp light soy sauce
- 15 g spring onions, finely sliced

## Method

1. Bring a large pan of water to a rolling boil.
2. Fry the garlic in the chilli oil over medium heat for 45 seconds, until it smells sweet and the edges have just turned pale gold. It must not brown — at this heat it goes from gold to bitter in the time it takes to look away.
3. Cook the noodles to the packet time, drain them but not too thoroughly, and toss them through the garlic oil with the soy sauce until every strand is coated.

## Notes

Free prose. What to buy, what goes wrong, what to do with the half tin left
over, and why anything unobvious is the way it is.

This renders as plain text rather than Markdown, so `**bold**` shows its
asterisks. Name another recipe by its title and the site links it for you.

## Storage

Not optional. How long it keeps and in what, whether it freezes and how to
bring it back. Where a dish must be eaten at once, say that instead — it is the
same question, answered.

## Diagram

- toss
  - boil 4 min
    - dried wheat noodles
  - fry 45 s
    - chilli oil
    - garlic
  - light soy sauce
  - spring onions

## Log

- 2026-08-24: Added. Say what you changed from the source and why.
```

---

## And a row for the ingredient library

Any ingredient the collection does not already have needs a row in
`content/ingredients.json`. **Buyability is the only test** — if an ordinary
supermarket or Asian supermarket sells it, add the row rather than bending the
recipe around what is already listed.

```json
{
  "name": "chilli oil",
  "usdaFdcId": null,
  "kcal100g": 600,
  "protein100g": 5.0,
  "carbs100g": 10.0,
  "fat100g": 60.0,
  "fiber100g": 4.0,
  "sugar100g": 2.0,
  "satFat100g": 9.0,
  "sodiumMg100g": 1500,
  "densityGPerMl": 0.9,
  "gramsPerUnit": null,
  "unitName": null,
  "excludes": ["peanut"],
  "source": "MANUAL",
  "sourceNote": "Crispy chilli oil of the Lao Gan Ma type, from a typical jar rather than FoodData Central. Roughly two-thirds oil and one-third fried solids. Tagged peanut: the crisp kind contains them as visible pieces.",
  "keeping": "Three months in the cupboard, six in the fridge, cap on. The oil goes rancid before the chilli does."
}
```

The four energy-bearing figures are required and are always **per 100 g**,
whatever unit the recipe uses. Everything else is optional and absent means
*unknown* rather than zero.

| Field | When you need it |
| --- | --- |
| `sourceNote` | Always in practice. Every figure is a magic number; say where it came from, and if it is a guess, say that it is a guess. |
| `usdaFdcId` | Where [FoodData Central](https://fdc.nal.usda.gov/) has the ingredient. |
| `densityGPerMl` | Where a recipe measures it by volume. Without it a tablespoon cannot be weighed. |
| `gramsPerUnit` | Where a recipe measures it by count — the mass of one clove, sheet, tin. |
| `unitName` | What one of those is called: `clove`, `head`, `sheet`, `portion`. With it, a line reading `400 g white cabbage` shows `(about 1 head)`. Needs `gramsPerUnit`. |
| `unitNamePlural` | Only where adding an -s is wrong: `leaf` → `leaves`. |
| `excludes` | What the ingredient rules out, for the dietary filters: `meat`, `pork`, `fish`, `shellfish`, `dairy`, `egg`, `peanut`, `nuts`, `sesame`, `soy`, `gluten`, `alcohol`. Most rows need none. |
| `madeUp` | For a liquid reconstituted from a packet — `{"unitName": "sachet", "perMl": 500, "note": "…"}`. Needs `densityGPerMl`. |
| `keeping` | For anything perishable: a place, a time, and the trick that extends it. |

The tags to think hardest about are the ones nobody sees coming: dashi is a
fish stock, oyster sauce is shellfish, gelatine is boiled from hide, soy sauce
is brewed with wheat, and crisp chilli oil has peanuts in it.

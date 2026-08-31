# Recipes

**→ [kyleyhw.github.io/recipes](https://kyleyhw.github.io/recipes/)**

A cooking collection that lives in a git repository. One Markdown file per
recipe; the site is generated from those files and published to GitHub Pages.
121 recipes and counting, mostly Cantonese, Japanese and Chinese, with the
British baking that gets made alongside them.

No database, no server, no account, no sign-up, and nothing to pay for. Every
page works with JavaScript switched off.

**Adding a recipe is adding a file, and you can hand the writing to a model —
[CONTRIBUTING.md](CONTRIBUTING.md) is five steps and needs no checkout.**

---

## Features

**Scales to any number of servings.** The stepper re-renders every quantity as
a measurement a kitchen can actually make — halves, thirds, quarters, sixths
and eighths, never sevenths. `salt to taste` and `oil for frying` are left
alone, because multiplying them produces confident nonsense.

**Scales the tin with it.** Doubling a cake batter into the same tin makes a
layer twice as deep and a burnt edge around a raw seam. A baked recipe states
its tin, and the site works out what tin the scaled batter wants — area with
the serving count, so the width goes as its square root — then names the
nearest one you are likely to own and what that does to the depth.

**Says what scaling does to the clock, which is mostly nothing.** Cooking and
waiting are set by how far heat has to travel through what is in the pan, so a
doubled recipe in a scaled tin bakes for exactly as long. Off a tin the claim
is conditional and says so, because a wok is a tin that cannot be scaled.

**Draws the method as a tree.** Every recipe carries a diagram: a table of
ingredients down the left and the operations that combine them to the right,
each operation standing exactly as tall as what it takes in. It is the only
view on the page that answers *what meets what* rather than *what next*.

**Computes macros per serving**, from a shared ingredient library — so
correcting a figure once fixes every recipe that uses it. Coverage is reported
by mass rather than by count, and an unmatched ingredient is a gap and never a
zero: "contains no fat" and "we do not know its fat content" are different
claims.

**Works out the dietary filters from the ingredients**, never from a field
somebody typed. Each ingredient row says what it rules out — dashi is a fish
stock, gelatine is boiled from hide, soy sauce is brewed with wheat — and
vegetarian, vegan, no-pork and the allergen filters fall out of that. Add
oyster sauce to a stir-fry two months later and the answer changes with it.

**Tells you how to keep what the recipe did not use.** Three quarters of a
cabbage, half a bunch of coriander, the rest of the packet of mince. It lives
on the ingredient rather than the recipe, because ginger is in ten recipes and
ten copies of the same paragraph would be ten paragraphs to keep in step.

**Speaks four languages** — English, 繁體中文, 简体中文 and Русский — and
**exports to four formats**, so a recipe can go straight into a tracker.

**Credits contributors from the git history.** Nobody fills anything in, and
nobody can get it wrong.

---

## Quickstart

**To read it:** [kyleyhw.github.io/recipes](https://kyleyhw.github.io/recipes/).
Every page works without JavaScript.

**To run it yourself:**

```bash
git clone https://github.com/kyleyhw/recipes.git
cd recipes
npm install
npm run dev            # http://localhost:3000
```

**To build the site the way GitHub Pages does:**

```bash
npm run build:static   # writes out/
npx serve out          # or any static file server
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build:static` | The static site, into `out/` |
| `npm test` | Unit tests, including a check that every recipe file parses |
| `npm run check` | Typecheck, lint, format check, tests |
| `npm run photos` | A picture for every recipe. Needs a key — [docs/photos.md](docs/photos.md) |
| `npm run photo:add` | Your own photograph on a recipe. No key |
| `uvx pre-commit install` | The commit hooks, including the one that blocks an API key. **Once per clone** |

---

## Usage

### Adding a recipe

Create `content/recipes/<slug>.md`. The filename becomes the URL.

```markdown
---
title: Banana Bread
description: Dark, dense and heavily spiced, with brown butter and black bananas.
category: Baked Goods
cuisine: British
tags:
  - freezes well
servings: 10
servingLabel: slice
prepMinutes: 20
cookMinutes: 60
tin:
  shape: loaf
  length: 23
  width: 13
  depth: 7
---

## Ingredients

- 115 g unsalted butter
- 4 bananas, black-skinned and soft
- 250 g all-purpose flour
- 1 tsp salt

## Method

1. Heat the oven to 175 °C and line a 900 g loaf tin with baking paper.
2. Melt the butter over medium heat for 4 to 6 minutes, swirling the pan, until
   brown flecks settle on the base and it smells of toffee.
3. Bake for 55 to 65 minutes, until a skewer comes out with moist crumbs but no
   wet batter.

## Notes

The bananas must be black, not merely spotted.

## Storage

Keeps four days at room temperature, wrapped in foil rather than cling film.

## Diagram

- bake 175 °C, 55–65 min
  - fold, no more than 15 turns
    - brown, 4–6 min
      - unsalted butter
    - mash to no lump bigger than a pea
      - bananas
    - all-purpose flour
    - salt

## Log

- 2026-08-11: Needed more salt — went up to 1½ tsp.
```

Only `title`, `category` and `servings` are required. Commit the file and push;
the site rebuilds itself.

Two sections earn their keep and are worth writing every time:

- **`## Storage`** — how long it keeps, whether it freezes, and how to bring it
  back. Most of what gets cooked is eaten again the next day, and a recipe that
  stops at the moment of serving has stopped halfway.
- **`## Diagram`** — the method as an indented tree, rendered as a table of
  ingredients and the operations that combine them. The form is Michael Chu's,
  from Cooking For Engineers.

The `## Diagram` block above renders as this, at the bottom of the recipe page:

<table>
  <tr>
    <th colspan="4" align="left">Banana Bread <em>(10 slices)</em></th>
  </tr>
  <tr>
    <td>115 g unsalted butter</td>
    <td>brown, 4–6 min</td>
    <td rowspan="4">fold, no more than 15 turns</td>
    <td rowspan="4">bake 175 °C, 55–65 min</td>
  </tr>
  <tr>
    <td>4 bananas</td>
    <td>mash to no lump bigger than a pea</td>
  </tr>
  <tr>
    <td colspan="2">250 g all-purpose flour</td>
  </tr>
  <tr>
    <td colspan="2">1 tsp salt</td>
  </tr>
</table>

Read it left to right. Each operation stands exactly as tall as the ingredients
it takes in, so the shape of the table *is* the shape of the method — which
bowl holds what, and when. A leaf that names an ingredient picks up its scaled
quantity and its translated name automatically, so the table redraws itself when
you change the serving count. The grammar and the eleven rules the layout obeys
are in [`docs/diagram.md`](docs/diagram.md).

A baked recipe should also state its `tin`, so the site can scale the batter to
the tin you actually own — and warn you when it cannot.

You can also edit any recipe straight from GitHub — every recipe page links to
its own file, its edit form, and its full history.

### Scaling

The stepper on a recipe changes the serving count. Quantities are re-rendered as
measurements a kitchen can actually make — halves, thirds, quarters, sixths and
eighths, never sevenths.

Lines like `salt to taste` and `oil for frying` are left alone, because
multiplying them produces confident nonsense. Leavening, salt in fermented
doughs, and bake times are **flagged rather than scaled**: they do not scale
linearly, and pretending otherwise would be invented precision.

### Macros

Computed per serving from `content/ingredients.json`, a shared table that every
recipe draws on — so correcting a figure once fixes every recipe using it.

Two things worth knowing when reading the panel:

- **Coverage is by mass, not by count.** An unmatched pinch of salt and an
  unmatched 500 g of flour are not the same situation.
- **An unmatched ingredient is a gap, never a zero.** "Contains no fat" and
  "we do not know its fat content" are different claims, and the panel keeps
  them apart.

If an ingredient shows as unmatched, add it to `content/ingredients.json` with
a note saying where its figures came from — and, if it is perishable, a
`keeping` note saying how to store what the recipe does not use. Those show
under the ingredient in the library drawer, which is the thing to open when
half a cabbage is still on the counter.

### Languages

The interface is available in English, 繁體中文, 简体中文 and Русский, from the
menu at the bottom of any page. Recipes are written in English and translated
by `npm run translate`, which needs an `ANTHROPIC_API_KEY` in the environment
and writes `content/recipes/<slug>.<language>.md` beside each recipe.

Translations are generated once and committed, never fetched at read time —
there is no server here to hold a key. A recipe with no translation yet shows
its English text inside the translated interface.

### Exporting

Every recipe has four export files, at its own serving count:

| Format | For |
| --- | --- |
| `/recipes/<slug>/export/json` | Scripts, and this application's own shape |
| `/recipes/<slug>/export/jsonld` | schema.org Recipe — what importers parse |
| `/recipes/<slug>/export/csv` | Ingredient rows with masses and macros |
| `/recipes/<slug>/export/txt` | Pasting into a tracker's recipe importer |

Per-serving macros do not change when you scale a recipe, so these figures are
the ones a tracker wants regardless of how much you cooked.

---

## Contributing a recipe

**Please do, and it is easier than the rest of this page makes it look.** A
contribution is one Markdown file — plus a row in the ingredient library if your
recipe uses something the collection does not already have — and you are meant
to hand the writing of it to a model.

[**CONTRIBUTING.md**](CONTRIBUTING.md) is that path in five steps: gather the
recipe in whatever shape you have it, paste one prompt, read the result back
against what you actually cook, create the file on github.com, open the pull
request. **No checkout required** — the same validation that runs locally runs
on your pull request and writes each problem onto the line that caused it.

**Don't worry about the photograph.** You are not expected to supply one.
Pictures are drawn from the recipe's own text, in a batch, later.

**Your name goes on it automatically.** Each recipe page says who added it and
links to the commit that did, taken from the git history rather than from a
field in the file — so there is nothing to fill in, and nothing that can drift
out of date. Later edits are credited too, beneath the author. Email addresses
are read to find a GitHub handle and are never published.

Would rather type it out yourself? [docs/contributing-by-hand.md](docs/contributing-by-hand.md)
is every section, every field and every check, and
[docs/recipe-template.md](docs/recipe-template.md) is a complete file to copy
and overwrite.

---

## Your own copy

1. **Fork or clone this repository.** Delete the recipes in
   `content/recipes/` and add your own.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Push to `main`.** The workflow tests, builds and publishes; the site
   appears at `https://<your-user>.github.io/<your-repo>/`.

Two notes on hosting:

- A GitHub Pages site is **publicly readable**, even from a private repository.
  Recipes are not secrets, but know it before you put anything else in there.
  Only you can change the files.
- The workflow sets `PAGES_BASE_PATH` to your repository name, which a project
  page needs. For a user page (`<user>.github.io`) or a custom domain, both
  served from the root, delete that line from
  `.github/workflows/pages.yml`.

Nothing else is configured, and there are no API keys to set. `ANTHROPIC_API_KEY`
is needed only to *generate* translations, never to read the site.

---

## Documentation

Design and reasoning live in [`docs/`](docs/index.md) — the file format, the
diagram, the nutrition pipeline, and how the Pages build works.

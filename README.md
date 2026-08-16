# Recipes

**→ [kyleyhw.github.io/recipes](https://kyleyhw.github.io/recipes/)**

A personal recipe collection that lives in a git repository. One Markdown file
per recipe; the site is generated from those files and hosted on GitHub Pages.

It scales portions to any number of servings, computes macros per serving for
export into a tracker, and keeps every version of every recipe — because the
files are in git, so the history is the file's history.

No database, no server, no account, and nothing to pay for.

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

| Command | Does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build:static` | The static site, into `out/` |
| `npm test` | Unit tests, including a check that every recipe file parses |
| `npm run check` | Typecheck, lint, format check, tests |

---

## How to use it

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
  ingredients and the operations that combine them. A leaf that names an
  ingredient picks up its scaled quantity and translated name automatically.
  See [`docs/diagram.md`](docs/diagram.md).

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
a note saying where its figures came from.

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

Recipes are welcome by pull request. Fork, add
`content/recipes/<slug>.md`, run `npm run check`, and open it —
[CONTRIBUTING.md](CONTRIBUTING.md) has what makes a recipe good rather than
merely valid, and the checks that run on your pull request are the same ones
that run before a deploy.

**Your name goes on it automatically.** Each recipe page says who added it and
links to the commit that did, taken from the git history rather than from a
field in the file — so there is nothing to fill in, and nothing that can drift
out of date. Later edits are credited too, beneath the author. Email addresses
are read to find a GitHub handle and are never published.

---

## Make your own

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

Design and reasoning live in [`docs/`](docs/index.md) — the mathematics behind
scaling and macros, the file format, and how the Pages build works.

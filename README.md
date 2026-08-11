# Recipes

A personal recipe collection that lives in a git repository. One Markdown file
per recipe; the site is generated from those files and hosted on GitHub Pages.

It scales portions to any number of servings, computes macros per serving for
export into a tracker, and keeps every version of every recipe — because the
files are in git, so the history is the file's history.

No database, no server, no account, and nothing to pay for.

---

## Quickstart

**To read it:** open the site. Every page works without JavaScript.

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
title: Dal Tarka
description: Red lentils cooked soft, finished with spices bloomed in hot ghee.
category: Mains
tags:
  - quick
  - vegetarian
servings: 4
prepMinutes: 10
cookMinutes: 35
source: https://example.com/where-it-came-from
---

## Ingredients

- 250 g red lentils
- 2 tbsp ghee
- 1 tsp fine salt

## Method

1. Rinse the lentils until the water runs clear.
2. Simmer for 25 minutes, until they collapse when pressed.

## Notes

Keeps three days in the fridge.

## Log

- 2026-08-11: Needed more salt — went up to 1½ tsp.
```

Only `title`, `category` and `servings` are required. Commit the file and push;
the site rebuilds itself.

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

Nothing else is configured, and there are no API keys to set.

---

## Documentation

Design and reasoning live in [`docs/`](docs/index.md) — the mathematics behind
scaling and macros, the file format, and how the Pages build works.

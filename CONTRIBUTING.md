# Adding a recipe

If you know how to cook something, you have everything you need. Recipes are
welcome by pull request, and a recipe is one Markdown file — adding one is
adding a file, and the site rebuilds itself when it merges.

This collection has opinions about how a recipe is written: steps with numbers
in them, a storage section, a shared ingredient library, a diagram with a
grammar of its own. That is a lot to read before you can share something you
already know how to make, so **the intended path is to hand it to a model.**
This page is that path, start to finish. You do not need a checkout, and you do
not need to have read any of the rules.

Two things to get out of the way first:

- **Don't worry about the photograph.** You are not expected to supply one, and
  a recipe without one is not a lesser recipe. Every picture on this site is
  drawn by an image model from the recipe's own text, in a batch, later — see
  [Photographs](#photographs) below. Leave the `photo:` field out entirely.
- **Don't worry about the nutrition panel, the diagram table, the translations
  or the attribution.** All four are generated from the file you write.

---

## What a contribution is

One file, and sometimes two:

| File | When |
| --- | --- |
| `content/recipes/<slug>.md` | Always. The filename becomes the URL, so `chilli-garlic-noodles.md` is `/recipes/chilli-garlic-noodles/`. Lower case, hyphens, no spaces |
| `content/ingredients.json` | Only if your recipe uses something the library does not already have — one JSON row per new ingredient |

That is the whole of it.

---

## The short path, in five steps

### 1. Gather your recipe, in whatever shape you have it

A photo of a page, a link, a voice note you typed out badly, a list in your
notes app. It does not need tidying first — that is the job you are handing
over.

### 2. Give a model your recipe and this prompt

Any capable model will do, in any chat window. Paste your recipe, then this:

> Write this as a recipe file for the collection at
> `https://github.com/kyleyhw/recipes`, following its rules exactly. Read all
> four of these first:
>
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/content/memories.md
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/docs/recipe-template.md
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/docs/contributing-by-hand.md
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/docs/diagram.md
>
> Give me two things:
>
> 1. The complete Markdown file, including the `## Diagram` section. Do not add
>    a `photo:` field — pictures are generated separately.
> 2. A JSON row for every ingredient not already in
>    `content/ingredients.json`, with a `sourceNote` on each saying where its
>    figures came from, and an `excludes` list where the ingredient rules
>    something out.
>
> An ingredient belongs in the recipe if an ordinary supermarket or Asian
> supermarket sells it. Whether the library already has a row for it is not the
> test — never bend the dish to avoid adding a row.

### 3. Read it back against what you actually cook

This is the step that matters, and it is the one only you can do. See
[What to check yourself](#what-to-check-yourself) below — it is four things, and
it takes a couple of minutes.

### 4. Put the files in the repository

**No checkout needed.** On github.com:

1. Go to [`content/recipes/`](https://github.com/kyleyhw/recipes/tree/main/content/recipes)
   and press **Add file → Create new file**.
2. Name it `<your-slug>.md` and paste the file in.
3. Press **Commit changes**, choose **Create a new branch and start a pull
   request**, and commit.
4. If you have new ingredient rows, open
   [`content/ingredients.json`](https://github.com/kyleyhw/recipes/blob/main/content/ingredients.json)
   on that same branch, press the pencil, and paste them in — the rows are in
   alphabetical order by `name`.

If you do have a checkout, the same two files, then `npm run validate`, which
says in sentences what is still wrong and names the file, the line, and where it
can, the library row you probably meant.

### 5. Open the pull request

The same validation runs on it and writes each problem onto the line that caused
it in the diff, so **you get the same help with no checkout at all**.

If it comes back red, that is normal and it is not a rejection — the message
says what to fix, and you can paste it straight back to the model that wrote the
file. Ask in the pull request if you would rather someone else picked it up.

---

## If you have a checkout and a coding agent

Claude Code, or anything like it, run inside a clone: the rules are already in
the repository and load themselves as project instructions, so

> add this recipe to the collection

is usually the whole prompt. Two things worth asking it to do afterwards:

- `npm run check` — validation, types, lint, formatting and tests in one.
- `npm run dev`, then open the recipe and **look at the diagram**. An outline
  that reads as obviously right in the file is regularly wrong as a table.

---

## What to check yourself

A model will produce a file that parses. It will not reliably produce a file
that is *true*, and four things are worth your own eyes:

- **The numbers.** Times, temperatures and quantities are where a model quietly
  smooths your recipe into the average of every similar recipe it has seen. If
  your grandmother's braise is 4 hours, check it still says 4 hours.
- **The nutrition rows.** Every figure in `content/ingredients.json` carries a
  `sourceNote` saying where it came from, and a model will happily invent both
  the figure and the source. Check them against
  [FoodData Central](https://fdc.nal.usda.gov/), or against the packet, and say
  which in the note. A wrong figure is worse than a missing one, because a gap
  is visible on the page and a wrong number is not.
- **The dietary tags.** A new ingredient row can carry an `excludes` list, and
  the site's vegetarian, vegan, no-pork and allergen filters are built entirely
  out of those tags — a missing one does not fail anything, it offers the recipe
  to somebody who cannot eat it. The ones a model forgets are the ones nobody
  sees coming: **dashi is a fish stock**, oyster sauce is shellfish, gelatine is
  boiled from hide, soy sauce is brewed with wheat, and crisp chilli oil has
  peanuts in it. Anything porcine carries `pork` *and* `meat`.
- **The diagram, rendered.** If you have a checkout, `npm run dev` and read the
  table against your method. If you do not, ask on the pull request and someone
  will look — indentation reads as grouping and the table reads as geometry, and
  those are not the same picture.

---

## Would you rather type it yourself?

Entirely welcome, and nothing here assumes otherwise.

| Document | Is |
| --- | --- |
| [docs/recipe-template.md](docs/recipe-template.md) | A complete file and a complete ingredient row, to copy and overwrite. The fastest start |
| [docs/contributing-by-hand.md](docs/contributing-by-hand.md) | The whole of it: every section, every front-matter field, the ingredient library, and what the checks cover |
| [docs/diagram.md](docs/diagram.md) | The diagram's grammar and the rules its table obeys |

---

## Your name goes on it automatically

This collection records who added each recipe, and it takes that from the git
history rather than from anything you type — the commit that adds the file is
the record, so the recipe page says "Added by *you*" and links to the commit.
There is no field to fill in. Two consequences:

- **Commit under your own account.** Whatever `git config user.name` and
  `user.email` say when you commit is what the site shows. Committing through
  the GitHub web interface handles this for you.
- **A linked name needs a GitHub address.** If your commits use GitHub's private
  address — `you@users.noreply.github.com`, the default when *Keep my email
  address private* is on, and always the case for edits made in the web
  interface — your name links to your profile. Otherwise it is shown unlinked.
  Your email address itself is never published.

The site can also filter the collection by who added a recipe, which is the
other half of the same idea.

## Photographs

**Nothing is expected of you here.** Leave `photo:` out and the recipe gets a
placeholder, which is fine, and later a generated picture like the rest of them.

If you *did* take a photograph of the dish, it is genuinely better than any
generated one and it is welcome — `npm run photo:add` puts it on the recipe and
needs no key. This repository is public, so anything committed here is
redistributed: add a picture only if you took it, or if its licence permits
redistribution and you record that in `photoCredit`. A picture found on a search
engine is neither.

## Changing someone else's recipe

Please do — a correction to a quantity, a step that turned out to be wrong, a
better sensory cue. The recipe stays attributed to whoever added it, and your
name is added beneath as having edited it since.

If you cooked it and want to record what happened, that is what `## Log` is for:

```markdown
## Log

- 2026-08-17: Needed more salt — went up to 1½ tsp.
```

The log is public, and it is a cook's log rather than a diary.

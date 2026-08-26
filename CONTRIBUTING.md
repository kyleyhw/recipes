# Adding a recipe

Recipes are welcome by pull request. A recipe is one Markdown file in
`content/recipes/`; adding one is adding a file, and the site rebuilds itself
when it merges.

This collection has opinions about how a recipe is written — steps with numbers
in them, a storage section, an ingredient library, a diagram with a grammar.
That is a lot to read before you can share a recipe you already know how to
cook, so **the intended path is to hand it to a model.**

---

## The short path

Give the model your recipe, however you have it — a photo of a page, a link, a
voice note you typed out badly — along with this:

> Write this as a recipe file for the collection at
> `https://github.com/kyleyhw/recipes`, following its rules exactly. Read all
> three of these first:
>
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/content/memories.md
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/docs/contributing-by-hand.md
> - https://raw.githubusercontent.com/kyleyhw/recipes/main/docs/diagram.md
>
> Give me the complete file, and a JSON row for every ingredient that is not
> already in `content/ingredients.json`.

Then put the file in `content/recipes/<slug>.md`, put any new ingredient rows in
`content/ingredients.json`, and open a pull request. **Those two files are the
whole of a contribution** — the photograph, the nutrition panel, the attribution
and the diagram table are all generated.

`npm run validate` says in sentences what is still wrong with it, naming the
file, the line, and where it can, the library row you probably meant. **If you
have no checkout, open the pull request anyway**: the same validation runs on it
and writes each problem onto the line that caused it in the diff.

If you are working in a checkout with Claude Code or a similar agent, the rules
are already in the repository — `content/memories.md` is loaded as project
instructions — so "add this recipe to the collection" is usually the whole
prompt.

## What you still have to do yourself

A model will produce a file that parses. It will not reliably produce a file
that is *true*, and three things are worth your own eyes:

- **The numbers.** Times, temperatures and quantities are where a model will
  quietly smooth your recipe into the average of every similar recipe it has
  seen. If your grandmother's braise is 4 hours, check it still says 4 hours.
- **The nutrition rows.** Every figure in `content/ingredients.json` carries a
  `sourceNote` saying where it came from, and a model will happily invent both
  the figure and the source. Check them against
  [FoodData Central](https://fdc.nal.usda.gov/), or against the packet, and say
  which in the note. A wrong figure is worse than a missing one, because a gap
  is visible on the page and a wrong number is not.
- **The diagram, rendered.** Run `npm run dev`, open the recipe, and read the
  table against your method. An outline that looks obviously right in the file
  is regularly wrong in the table — indentation reads as grouping, and the
  table reads as geometry.

## Doing it by hand

[docs/recipe-template.md](docs/recipe-template.md) is a complete file and a
complete ingredient row to copy and overwrite, which is the fastest start.

[docs/contributing-by-hand.md](docs/contributing-by-hand.md) is the whole of it:
every section of the file, every front-matter field, the ingredient library, and
what the checks cover. [docs/diagram.md](docs/diagram.md) is the diagram's
grammar and its rules.

---

## Your name goes on it automatically

This collection records who added each recipe, and it takes that from the git
history rather than from anything you type — the commit that adds the file is
the record, so the recipe page says "Added by *you*" and links to the commit.
There is no field to fill in. Two consequences:

- **Commit under your own account.** Whatever `git config user.name` and
  `user.email` say when you commit is what the site shows.
- **A linked name needs a GitHub address.** If your commits use GitHub's private
  address — `you@users.noreply.github.com`, the default when *Keep my email
  address private* is on, and always the case for edits made in the GitHub web
  interface — your name links to your profile. Otherwise it is shown unlinked.
  Your email address itself is never published.

The site can also filter the collection by who added a recipe, which is the
other half of the same idea.

## Photographs

A recipe with no `photo:` gets a generated placeholder, which is fine — most of
them have one.

This repository is public, so anything committed here is redistributed. Add a
photograph only if **you took it**, or if its licence permits redistribution and
you record that in `photoCredit`. A picture found on a search engine is neither.

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

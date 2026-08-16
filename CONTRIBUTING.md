# Adding a recipe

Recipes are welcome by pull request. A recipe is one Markdown file in
`content/recipes/`; adding one is adding a file, and the site rebuilds itself
when it merges.

**Your name goes on it automatically.** This collection records who added each
recipe, and it takes that from the git history rather than from anything you
type — the commit that adds the file is the record, so the recipe page says
"Added by *you*" and links to the commit. There is no field to fill in and
nothing to remember. Two consequences worth knowing:

- **Commit under your own account.** Whatever `git config user.name` and
  `user.email` say at the moment you commit is what the site will show.
- **A linked name needs a GitHub address.** If your commits use GitHub's private
  address — `you@users.noreply.github.com`, which is the default when *Keep my
  email address private* is on, and always the case for edits made in the GitHub
  web interface — your name links to your profile. If they use a personal
  address, your name is shown without a link. Your email address itself is never
  published on the site.

---

## The short version

1. Fork the repository and make a branch.
2. Add `content/recipes/<slug>.md`. The filename becomes the URL.
3. Add anything new it uses to `content/ingredients.json`.
4. Run `npm run check`.
5. Open a pull request.

The [README](README.md#adding-a-recipe) has a complete file to copy. Only
`title`, `category` and `servings` are required by the parser — the rest of this
page is what makes a recipe good rather than merely valid.

---

## What a recipe needs

These are the standing rules of the collection, kept in full in
[`content/memories.md`](content/memories.md). They are not style preferences;
each of them exists because a recipe without it failed somebody in the kitchen.

**Steps that cannot be misread.** Say exactly what to do, to what, for how long.
Temperatures, pan sizes and heat levels are numbers, not adjectives. Every step
that ends gives a sensory cue for how to tell it is done — what it looks, smells
or sounds like. No "about", no "or so", no "until done".

**Seasoning that means it.** Where a recipe suggests a cautious amount of chilli,
acid, garlic or spice, take the upper end. A dish that tastes of nothing is a
failure even if it is technically correct.

**A `## Storage` section.** How long it keeps and in what, whether it freezes and
how to defrost it, how to bring it back without ruining it. Where a dish
genuinely must be eaten straight away, say that instead — it is the same
question, answered.

**Every ingredient in the library.** Anything your recipe introduces needs a row
in `content/ingredients.json`, with its per-100 g figures, its density or
grams-per-item where it is measured by volume or by count, and a `sourceNote`
saying where each figure came from. A missing row does not fail the build; it
quietly drops that ingredient out of the nutrition panel and shows up as a
coverage gap. USDA FoodData Central is the usual source, a jar label is an
acceptable one, and a guess is not.

**A `## Diagram`.** The method as an indented tree, which renders as the table of
ingredients and operations at the bottom of every recipe page. The eleven rules
are in [`docs/diagram.md`](docs/diagram.md); four of them account for most
mistakes:

- an operation's box spans **exactly** the ingredients it consumes, and those
  ingredients must be a **contiguous** block of rows — so the left column read
  downward is the order things *enter* the recipe, not the order your ingredient
  list happens to use;
- **a sequence is a chain, not a fan.** "Whisk in the sugar, then the eggs, then
  the bananas" is three operations, not one node with four inputs;
- **labels stay short** — two or three words. The detail is in the method;
- **look at it rendered** before you call it done. Run `npm run dev`, open the
  recipe and read the table against your method. An outline that is obviously
  right on the page is regularly wrong in the table.

**A tin, if it is baked.** `tin:` in the front matter, so the site can scale the
batter to the tin you actually own. A batter doubled into the same tin is twice
as deep and bakes wrongly.

**Where it came from.** `source:` for a recipe off a website. If it came from a
person, say so in `## Notes`.

---

## Photographs

A recipe with no `photo:` gets a generated placeholder, which is fine — most of
them have one.

This repository is public, so anything committed here is redistributed. Add a
photograph only if **you took it**, or if its licence permits redistribution and
you record that in `photoCredit`. A picture found on a search engine is neither.

---

## Before you open the pull request

```bash
npm run check     # typecheck, lint, format, tests
npm run dev       # then look at the recipe page, and at its diagram
```

`npm run check` reads the real `content/` directory, so it catches broken front
matter, an ingredient missing from the library, and a diagram whose split
fractions do not add up — each with the file named. The same checks run on your
pull request.

What it cannot catch is whether the diagram is *right*, whether the steps are
unambiguous, and whether the seasoning is enough. That is what the review is
for.

## Changing someone else's recipe

Please do — a correction to a quantity, a step that turned out to be wrong, a
better sensory cue. The recipe stays attributed to whoever added it, and your
name is added to the line beneath as having edited it since.

If you cooked it and want to record what happened, that is what `## Log` is for:

```markdown
## Log

- 2026-08-16: Needed more salt — went up to 1½ tsp.
```

The log is public and it is a cook's log, not a diary.

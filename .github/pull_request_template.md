<!--
Adding a recipe? CONTRIBUTING.md has the whole list. The checks below are the
ones that go wrong most often, and the first two are the ones `npm run check`
cannot do for you.

You do not need to say who you are: the site takes that from your commit and
puts your name on the recipe page automatically.
-->

## What this is

<!-- One line. For a recipe: what the dish is, and where it came from. -->

## For a new or changed recipe

- [ ] I looked at the rendered diagram (`npm run dev`) and read it against the method
- [ ] Every step says how to tell it is done — no "about", no "until done"
- [ ] `## Storage` says how it keeps and how to bring it back
- [ ] Anything new is in `content/ingredients.json`, with a `sourceNote` per figure
- [ ] `tin:` is set, if it is baked
- [ ] Any photograph is mine, or its licence allows redistribution
- [ ] `npm run check` passes

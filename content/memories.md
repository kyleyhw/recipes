# Memories

Standing instructions for this collection. They apply to every recipe written,
adjusted or imported into it — stated once here rather than remembered each
time.

They are a file like everything else, so changing one is a commit, and the
history says when a preference changed and why.

## This repository is public

Everything committed here is world-readable, and git makes it permanent: a file
deleted in the next commit is still in the history. Nothing goes in that would
not be fine on a noticeboard.

- **No keys, ever.** The site needs none to build or to read; `ANTHROPIC_API_KEY`
  is used only by `npm run translate`, on the machine that runs it. It belongs
  in `.env`, which is ignored.
- **The Log is public.** It is a cook's log — what needed more salt, what
  burned — not a diary.
- **Credit what came from elsewhere.** A recipe taken off a website records its
  `source`, and one taken from a person records who.
- **Photographs are the open question.** Sourcing them automatically was
  decided when this was a private collection for personal use. A public
  repository redistributes whatever it holds, and that is a different question
  from looking at a picture at home. Anything added now should be a photo taken
  here or one whose licence permits redistribution.

## Taste

- **Strong, assertive flavours.** Season properly. Where a recipe suggests a
  cautious amount of chilli, acid, garlic or spice, take the upper end. A dish
  that tastes of nothing is a failure even if it is technically correct.

## How a recipe must be written

- **Steps must be unambiguous, direct and straightforward.** Say exactly what to
  do, to what, and for how long. Temperatures, pan sizes and heat levels are
  numbers, not adjectives. Every step that ends gives a sensory cue for how to
  tell it is done — what it looks, smells or sounds like. No hedging: never
  "about", "or so", or "until done".

- **Storage and reheating instructions, where they apply.** How long it keeps
  and in what; whether it freezes and how to defrost it; how to bring it back
  without ruining it. Most of what gets cooked is eaten again the next day, and
  a recipe that stops at the moment of serving has stopped halfway. Where a dish
  genuinely must be eaten immediately, say that instead — it is the same
  question, answered.

- **Every ingredient a recipe uses must exist in the library.** Adding a recipe
  means adding any ingredient it introduces to `content/ingredients.json`, with
  its density or grams-per-item where it is measured by volume or by count, and
  with a sourced note for every figure. A missing entry does not fail the build;
  it quietly drops that ingredient out of the nutrition figures and shows up
  later as a coverage gap on the recipe page. The gap is always a missing row,
  never a limit of the arithmetic.

- **Every recipe needs a diagram**, and it must obey the eleven rules in
  [docs/diagram.md](../docs/diagram.md). Four are worth remembering while
  writing one:

  - an operation's box spans **exactly** the ingredients it consumes;
  - those ingredients must be a **contiguous** block of rows;
  - so the left column, read downward, is the order things **enter** the
    recipe — not the order the ingredient list happens to use;
  - **labels stay short** — two or three words, a number only where the number
    is the point. The detail is in the method; the diagram is the shape;
  - and a **sequence is a chain, not a fan**. "Whisk in the sugar, then the
    eggs, then the bananas" is three operations. Drawing it as one node with
    four inputs loses the ordering the instruction exists to convey.

  Leaves that name an ingredient pick up its scaled quantity and translated
  name automatically, so write them as the ingredient is written. Where an
  ingredient is split across two uses, write it as a fraction — `1/3 peanut
  oil` — and the diagram shows what that fraction comes to and rescales it.

- **Look at a diagram before calling it good.** Build the site, open the recipe
  and read the rendered table against the method. Do not judge it from the
  outline: an outline that is obviously right on the page is regularly wrong in
  the table, because indentation reads as grouping and the table reads as
  geometry, and those are not the same picture.

  `npm test` catches a missing diagram, a forgotten ingredient and shares that
  do not add up. It cannot catch the three that matter most, and those are
  exactly the ones that need eyes on the rendered page:

  - **the row order** — does the left column, read downward, match the order
    the method introduces things?
  - **chain or fan** — is a sequence drawn as a sequence, or collapsed into
    one node with four inputs?
  - **the labels** — is anything long enough to force a wide column, and has a
    scrollbar appeared as a result?

  Screenshot it. Every diagram that has gone wrong here has looked fine as an
  outline and looked wrong immediately as a picture.

- **Baked goods must state their tin**, and scale it. A cake batter doubled into
  the same tin is twice as deep and bakes wrongly: the outside sets before the
  middle is done. See [docs/mathematics.md](../docs/mathematics.md) for how the
  tin is scaled with the recipe.

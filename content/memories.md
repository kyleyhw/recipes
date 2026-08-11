# Memories

Standing instructions for this collection. They apply to every recipe written,
adjusted or imported into it — stated once here rather than remembered each
time.

They are a file like everything else, so changing one is a commit, and the
history says when a preference changed and why.

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

- **Every recipe needs a diagram.** A `## Diagram` section holding the method as
  an indented tree: ingredients as leaves, operations as the lines above them.
  The method says what to do in order; the diagram says what meets what, which
  is the thing prose is worst at. Leaves that name an ingredient pick up its
  scaled quantity and translated name automatically, so write them as the
  ingredient is written. See [docs/diagram.md](../docs/diagram.md).

- **Baked goods must state their tin**, and scale it. A cake batter doubled into
  the same tin is twice as deep and bakes wrongly: the outside sets before the
  middle is done. See [docs/mathematics.md](../docs/mathematics.md) for how the
  tin is scaled with the recipe.

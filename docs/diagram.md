# The recipe diagram

Every recipe carries a `## Diagram` section: the method as a tree, rendered as
a table of ingredients on the left and the operations that combine them to the
right. The form is Michael Chu's, from Cooking For Engineers.

## Why

A method is a tree. Things are combined, and the combinations are combined.
A numbered list flattens that tree into a sequence and makes the reader rebuild
it in their head — which of these four bowls does this one go into, and when.
The diagram shows it in one glance, and it is the only view on the page that
answers "what meets what" rather than "what next".

It does not replace the method. The list is what you follow standing at the
stove; the diagram is what you read before you start, to see the shape of the
thing.

## The format

An indented list, written root first. A line with children is an operation; a
line without is an ingredient.

```markdown
## Diagram

- bake 175 °C, 55–65 min
  - fold 15 turns, then 3 more
    - whisk
      - brown, 4–6 min
        - unsalted butter
      - brown sugar
    - stir 10 s
      - all-purpose flour
      - salt
    - walnuts
```

And that renders as this — one row per ingredient, each operation standing as
tall as the ingredients it takes in:

<table>
  <tr>
    <th colspan="5" align="left">Walnut Loaf <em>(10 slices)</em></th>
  </tr>
  <tr>
    <td>115 g unsalted butter</td>
    <td>brown, 4–6 min</td>
    <td rowspan="2">whisk</td>
    <td rowspan="5">fold 15 turns, then 3 more</td>
    <td rowspan="5">bake 175 °C, 55–65 min</td>
  </tr>
  <tr>
    <td colspan="2">200 g brown sugar</td>
  </tr>
  <tr>
    <td>250 g all-purpose flour</td>
    <td rowspan="2" colspan="2">stir 10 s</td>
  </tr>
  <tr>
    <td>1 tsp salt</td>
  </tr>
  <tr>
    <td colspan="3">80 g walnuts</td>
  </tr>
</table>

Read it left to right: butter is browned, the sugar joins it in the whisk, flour
and salt are stirred together separately, and the two meet the walnuts in the
fold. The quantities are not in the outline — they come from the ingredient
list, which is why they change when you change the serving count.

That is the whole grammar. Anything richer would be a second recipe format to
keep in step with the first.

## Syntax, in full

| Written | Means |
| --- | --- |
| `- text` at the least indentation | The **root** — the last operation, and the last top-level line in the section |
| `- text` at a greater indentation | A **child** of the nearest line above it with strictly less indentation |
| A line **with** children | An **operation**. Its text is the label — two or three words |
| A line **without** children | An **ingredient**, or a piece of plain text if it matches no ingredient |
| A top-level line **above** the root | A **banner**: an operation that takes nothing in, like heating an oven. It spans the full width above the table |
| `- 1/3 peanut oil` | A **share** of an ingredient used in more than one place. Renders as that fraction of the scaled quantity |
| `- ⅓ peanut oil` | The same. `½ ⅓ ⅔ ¼ ¾ ⅛` are accepted alongside `1/2`, `1/3` and so on |

Any consistent indent width works — two spaces, four, a tab — because a line is
a child of the nearest line above it with less indentation, not of a line a
fixed distance to its left. It survives whatever editor it is typed in.

The shares of one ingredient must add up to exactly 1, and `npm test` fails if
they do not. Two thirds and a third is a split; two thirds and two thirds is a
recipe that uses more of something than it lists.

## Where it is rendered

Three files, in order:

| File | Does |
| --- | --- |
| [`src/lib/content/format.ts`](../src/lib/content/format.ts) | Reads the `## Diagram` section out of the recipe file, keeping the indentation verbatim, since the indentation *is* the tree |
| [`src/lib/content/diagram.ts`](../src/lib/content/diagram.ts) | Parses the outline, links leaves to ingredients, and computes the grid — which row each cell sits on, and how many rows and columns it spans |
| [`src/components/recipe-diagram.tsx`](../src/components/recipe-diagram.tsx) | Draws it as a real `<table>` with `rowspan` and `colspan`, on the recipe page below the method |

The grid is computed at **build time**, on the server, because it depends only
on the file. What the browser gets is the finished table. The one thing that
happens in the browser is the quantities changing when the serving stepper
moves, and those come from the ingredient list rather than from the diagram.

## Leaves are references

A leaf whose text matches an ingredient becomes that ingredient, by index. It
then shows the **scaled** quantity when the serving count changes and the
**translated** name when the language changes, without the diagram knowing that
either exists. Write leaves the way the ingredient is written and they will
link themselves.

Matching is strict, for the same reason the ingredient library's is: a loose
match would put the wrong quantity beside the right word, and a wrong quantity
that looks right is worse than plain text. Each ingredient is claimed once, so a
recipe using butter twice does not have both leaves point at the first. A leaf
that matches nothing is shown as written — which is what you want for "1 graham
cracker crust" in a recipe that never listed one.

## The rules

Eight, in the order they constrain each other. Rules 3–6 are the ones that make
the form work; break any of them and the table still renders, still looks
plausible, and no longer means anything.

1. **One row per ingredient, always.** Rows never split, merge or disappear. The
   table's height is the ingredient count. An ingredient split across two uses
   adds a row; it never removes one.

2. **Column 0 holds ingredients and nothing else**, all the same width. This is
   what makes the left edge scannable — you should be able to read the shopping
   list down it without reading anything else.

3. **An operation is strictly to the right of every input it consumes.** Time
   runs left to right. No operation may sit level with, or left of, something
   feeding it.

4. **An operation's box spans exactly the rows of its inputs.** That vertical
   extent *is* the information the diagram carries: it says "these, and only
   these, are in the bowl now". A box one row too tall is a lie about the dish.

5. **An operation's inputs must be a contiguous block of rows.** You cannot
   have one operation take rows 1, 2 and 5. This is the load-bearing
   constraint, and everything below follows from it.

6. **Chronological monotonicity.** Reading the left column downward gives the
   order ingredients enter the recipe. An ingredient used later can never sit
   above one used earlier. This is a *consequence* of 3 and 5 rather than a
   separate rule — if every operation spans a contiguous block and time runs
   rightward, no other order is possible — but it is the one worth checking by
   hand, because it is the one a careless edit breaks.

7. **Ingredients are ordered by use, not by the recipe's ingredient list.**
   Those two orders differ, and the diagram follows use. Banana bread lists the
   bananas second and uses them fourth; the diagram puts them fourth.

8. **Cells stretch; nothing is ever blank.** An ingredient that goes straight
   into an operation three columns away is drawn as one long box reaching it,
   not as a short box and a hole. There is no empty square anywhere in the
   table.

   *This rule was written backwards at first* — as "gaps are blank" — on a
   misreading of the cheesecake. Both of Chu's diagrams stretch: the chicken's
   `3 boneless, skinless chicken breasts` runs under `combine`, and its three
   spices run under `brine 4 hours`. Corrected here rather than quietly, since
   this file is the record.

9. **A banner for operations with no ingredients.** Heating an oven or lighting
   a grill takes nothing in, so it has no rows to stand against. It spans the
   full width above everything, and is written as a top-level line *before* the
   root:

   ```markdown
   - heat the oven to 175 °C
   - cool 1 h
     - bake 60 min
       ...
   ```

   The last top-level line is the root; anything above it is a banner.

10. **A title bar**, carrying the recipe's name and the serving count the table
    is drawn at. It is inside the table so that it is exactly as wide as the
    diagram and scrolls with it.

11. **One fill for every cell.** Position already says which cells are
    ingredients — the left column is ingredients and nothing else — so
    colouring operations differently states twice what the layout says once.

### Keep the labels short

`combine`. `season`. `brine 4 hours`. Two or three words, and a number only
where the number is the point. Long labels force wide columns, wide columns
force a horizontal scrollbar, and the scrollbar hides the last operation —
which is the finished dish.

The detail belongs in the method, which is directly below. The diagram is the
shape.

### A chain is not a fan

The commonest way to get a diagram wrong while obeying every rule above is to
collapse a sequence into a single node. "Whisk the sugar into the butter, then
the eggs one at a time, then the bananas" is three operations, and drawing it
as one `whisk` taking four inputs loses the ordering that the instruction
exists to convey. Chu's cheesecake is the model: `mix until smooth` → `mix` →
`mix in thirds` → `mix`, each adding the next thing.

The test is whether the recipe would still work if the inputs to a node arrived
in any order. If it would not, the node is a chain and should be drawn as one.

### What is checked, and what is not

Rules 3, 4 and 5 hold **by construction** — the outline is a tree, and a tree
laid out this way cannot violate them.

Rule 8 holds by construction too, since the renderer emits blank cells rather
than stretching anything.

Rules 1, 2 and 8 are asserted in `tests/unit/diagram.test.ts` against every
recipe in the collection, not against a fixture — rule 8 as "every row adds up
to the full width", which is the same statement as "no holes".

`validateDiagram` catches the one mechanical failure that is otherwise
invisible: **an ingredient the diagram forgot**. A recipe with fourteen
ingredients and a twelve-leaf diagram looks entirely reasonable, and the two
that are missing are missing from the reader's understanding of the dish. The
loader reports it, so it shows on the site rather than waiting to be noticed.

Rules 6 and 7 cannot be checked by a program — they are claims about the
method, which only a reader can compare against. Neither can "chain, not fan",
nor "keep the labels short".

**Check those four by rendering the page and looking at it**, not by reading the
outline. The outline shows nesting; the table shows geometry, and a nesting that
looks obviously right is regularly a table that is obviously wrong. Every
diagram that has gone wrong in this repository read fine as an outline and read
wrong as a picture, in about a second.

## The geometry

Two numbers place every cell.

- **rowspan** is the number of leaves beneath a node. This is what makes an
  operation stand exactly as tall as the ingredients it consumes, and that
  vertical alignment *is* the information the diagram carries.
- **column** is one past the furthest of a node's children, so an operation
  always sits to the right of everything feeding it. The root lands in the last
  column.

**colspan** then fills the gap from a node to its parent, so every row spans the
full width. Without it a leaf dropping straight into a deep operation leaves a
hole, and a table with holes is laid out however the browser feels like.

It is a real `<table>` rather than a grid of divs, because `rowspan` is the one
layout primitive that expresses "as tall as its inputs" without measuring
anything. A CSS grid would need every span computed in pixels and would come
apart the moment a label wrapped.

On a phone it scrolls sideways inside its own box rather than reflowing. A tree
four levels deep has no one-column form; flattening it back into a list would
produce the numbered method, which is already directly below it.

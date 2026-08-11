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

That is the whole grammar. Anything richer would be a second recipe format to
keep in step with the first.

Any consistent indent width works — a line is a child of the nearest line above
it with strictly less indentation — so it survives whatever editor it is typed
in.

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

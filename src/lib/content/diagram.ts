/**
 * The recipe diagram: ingredients on the left, operations to the right.
 *
 * The form is Michael Chu's, from Cooking For Engineers. A recipe's method is a
 * *tree* — things are combined, and the combinations are combined — and prose
 * is a poor way to show a tree. The diagram shows in one glance what a numbered
 * list makes you hold in your head: which ingredients meet each other, when,
 * and what happens to them once they have.
 *
 * ## The format
 *
 * An indented list under `## Diagram`, written root first:
 *
 *     - bake 175 °C, 60 min
 *       - fold, 15 turns
 *         - whisk
 *           - brown the butter
 *             - unsalted butter
 *           - brown sugar
 *         - stir 10 s
 *           - all-purpose flour
 *           - salt
 *       - walnuts
 *
 * A line with children is an operation. A line without is an ingredient. That
 * is the whole grammar, and it is deliberately the whole grammar: anything
 * richer would be a second recipe format to keep in step with the first.
 *
 * ## Leaves are references, not text
 *
 * A leaf whose text matches an ingredient in the recipe becomes that
 * ingredient, by index — so the diagram shows the *scaled* quantity when you
 * change the serving count, and the *translated* name when you change the
 * language, without the diagram knowing anything about either. A leaf that
 * matches nothing is shown as written, which is what you want for "1 graham
 * cracker crust" in a recipe that never listed one.
 */

export interface DiagramNode {
  /** The line as written. */
  text: string;
  /** Index into the recipe's ingredients, or null when it matched none. */
  ingredientIndex: number | null;
  children: DiagramNode[];
}

/** A node with its position in the rendered table. */
export interface PlacedNode extends DiagramNode {
  /** Rows this cell spans: the number of leaves beneath it. */
  rowSpan: number;
  /** Columns this cell spans, filling the gap to its parent. */
  colSpan: number;
  /** The row this cell starts on. */
  row: number;
  /** Distance from the leaf column. Leaves are 0. */
  column: number;
}

export interface Diagram {
  root: DiagramNode;
  /** Total columns in the table: the root's column plus one. */
  columns: number;
  /** Total rows: one per leaf. */
  rows: number;
  /** Every node, in the order cells should be emitted. */
  cells: PlacedNode[];
}

/**
 * Parses the indented outline.
 *
 * Indentation is counted in leading spaces, and any consistent step works — two
 * spaces, four, a tab expanded — because a line is a child of the nearest line
 * above it with strictly less indentation. That rule needs no fixed step size,
 * which matters for a file people edit by hand in whatever editor they have.
 *
 * Returns null rather than throwing on an empty or malformed section: a recipe
 * without a diagram is the ordinary case, not an error.
 */
export function parseDiagram(lines: readonly string[]): DiagramNode | null {
  const entries: Array<{ indent: number; text: string }> = [];

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (!match) continue;
    const text = (match[2] ?? "").trim();
    if (text.length === 0) continue;
    entries.push({ indent: (match[1] ?? "").replace(/\t/g, "    ").length, text });
  }

  if (entries.length === 0) return null;

  // The first line is the root, and everything else hangs beneath it. A file
  // with two top-level lines has two roots and no single dish; the second and
  // any after it are dropped rather than guessed at.
  const first = entries[0];
  if (!first) return null;

  const root: DiagramNode = { text: first.text, ingredientIndex: null, children: [] };
  const stack: Array<{ indent: number; node: DiagramNode }> = [
    { indent: first.indent, node: root },
  ];

  for (const entry of entries.slice(1)) {
    while (stack.length > 1 && entry.indent <= (stack[stack.length - 1]?.indent ?? 0)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (!parent) continue;
    const node: DiagramNode = { text: entry.text, ingredientIndex: null, children: [] };
    parent.node.children.push(node);
    stack.push({ indent: entry.indent, node });
  }

  return root;
}

/** Serialises a tree back to the outline, for a byte-stable round trip. */
export function serialiseDiagram(root: DiagramNode): string[] {
  const lines: string[] = [];
  const walk = (node: DiagramNode, depth: number): void => {
    lines.push(`${"  ".repeat(depth)}- ${node.text}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines;
}

/**
 * Attaches each leaf to the ingredient it names.
 *
 * Matching is on the normalised text and is deliberately strict, for the reason
 * the ingredient library is: a loose match would show the wrong quantity beside
 * the right word, and a wrong quantity that looks right is worse than a line of
 * plain text. Each ingredient is claimed at most once, so a recipe using butter
 * twice does not have both leaves point at the first.
 */
export function linkIngredients(
  root: DiagramNode,
  ingredientNames: readonly string[],
): DiagramNode {
  const normalise = (text: string): string =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const available = ingredientNames.map(normalise);
  const claimed = new Set<number>();

  const walk = (node: DiagramNode): DiagramNode => {
    if (node.children.length > 0) {
      return { ...node, ingredientIndex: null, children: node.children.map(walk) };
    }
    const wanted = normalise(node.text);
    const index = available.findIndex(
      (name, at) => !claimed.has(at) && (name === wanted || name.startsWith(`${wanted} `)),
    );
    if (index >= 0) claimed.add(index);
    return { ...node, ingredientIndex: index >= 0 ? index : null, children: [] };
  };

  return walk(root);
}

/**
 * Works out where every cell goes.
 *
 * Two numbers do the work. A cell's **rowspan** is the number of leaves beneath
 * it, which is what makes an operation line up against exactly the ingredients
 * it consumes. Its **column** is one past the furthest of its children, so an
 * operation always sits to the right of everything feeding it.
 *
 * The **colspan** then fills the gap to the parent. Without it a leaf dropping
 * straight into a deep operation would leave holes in the row, and a table with
 * holes is a table the browser lays out however it likes.
 */
export function placeDiagram(root: DiagramNode): Diagram {
  const leafCount = (node: DiagramNode): number =>
    node.children.length === 0
      ? 1
      : node.children.reduce((total, child) => total + leafCount(child), 0);

  const columnOf = (node: DiagramNode): number =>
    node.children.length === 0
      ? 0
      : Math.max(...node.children.map(columnOf)) + 1;

  const rootColumn = columnOf(root);
  const cells: PlacedNode[] = [];

  const walk = (node: DiagramNode, row: number, parentColumn: number): void => {
    const column = columnOf(node);
    cells.push({
      ...node,
      row,
      column,
      rowSpan: leafCount(node),
      // The root has no parent to reach, so it spans one column.
      colSpan: Math.max(1, parentColumn - column),
    });

    let next = row;
    for (const child of node.children) {
      walk(child, next, column);
      next += leafCount(child);
    }
  };

  walk(root, 0, rootColumn + 1);

  // Row-major, so the cells can be emitted straight into <tr>s: everything on
  // row 0 first, and within a row, leftmost first — which is *ascending*
  // column, because column 0 is the leaves. Ingredients read down the left edge
  // and the operations flow right, ending at the dish.
  cells.sort((a, b) => a.row - b.row || a.column - b.column);

  return { root, columns: rootColumn + 1, rows: leafCount(root), cells };
}

/** Everything, from an outline and a recipe's ingredients. */
export function buildDiagram(
  lines: readonly string[],
  ingredientNames: readonly string[],
): Diagram | null {
  const parsed = parseDiagram(lines);
  if (!parsed) return null;
  return placeDiagram(linkIngredients(parsed, ingredientNames));
}

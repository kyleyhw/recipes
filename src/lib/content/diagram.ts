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
  /** The line as written, with any leading fraction removed. */
  text: string;
  /** Index into the recipe's ingredients, or null when it matched none. */
  ingredientIndex: number | null;
  /**
   * The share of that ingredient this leaf takes, where the recipe splits one
   * ingredient across two uses. Null means the whole of it.
   *
   * Written as a leading fraction — `- 1/3 peanut oil` — and it is a *fraction*
   * rather than an amount on purpose. The recipe's line already says how much
   * oil there is, and that figure moves when the serving count does; a third of
   * it moves with it. Writing "1 tbsp" here instead would be correct at four
   * servings and wrong at eight, silently.
   */
  share: number | null;
  children: DiagramNode[];
}

/** `1/3 `, `½ `, `2/3 ` at the head of a leaf. */
const SHARE = /^(?:(\d+)\s*\/\s*(\d+)|([½⅓⅔¼¾⅛]))\s+/;

const GLYPH_SHARES: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
};

function splitShare(text: string): { share: number | null; rest: string } {
  const match = SHARE.exec(text);
  if (!match) return { share: null, rest: text };

  const glyph = match[3];
  if (glyph) return { share: GLYPH_SHARES[glyph] ?? null, rest: text.slice(match[0].length) };

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!denominator) return { share: null, rest: text };
  return { share: numerator / denominator, rest: text.slice(match[0].length) };
}

/** A node with its position in the rendered table. */
export interface PlacedNode extends DiagramNode {
  /** Rows this cell spans: the number of leaves beneath it. */
  rowSpan: number;
  /** The row this cell starts on. */
  row: number;
  /** Distance from the leaf column. Leaves are 0. */
  column: number;
  /**
   * Columns this cell spans, reaching from its own to its parent's.
   *
   * A cell stretches to meet the operation it feeds rather than leaving the
   * squares between them empty. That is how the form is drawn — a lone
   * ingredient dropping into a late operation is one long box, not a short box
   * and a hole — and a table with no empty squares is also a table the browser
   * cannot lay out in more than one way.
   */
  colSpan: number;
}

export interface Diagram {
  root: DiagramNode;
  /** Total columns in the table: the root's column plus one. */
  columns: number;
  /** Total rows: one per leaf. */
  rows: number;
  /** Every node, in the order cells should be emitted. */
  cells: PlacedNode[];
  /** The table, row by row, ready to emit. Never has a hole in it. */
  grid: PlacedNode[][];
  /**
   * Operations that take no ingredients at all, spanning the full width above
   * everything else — "heat the oven to 175 °C".
   *
   * They have no inputs, so they have no rows to stand against and no place in
   * the tree. Written as the top-level lines *before* the root, and rendered as
   * banners, which is where the form has always put them.
   */
  banners: string[];
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

  // The *last* top-level line is the root; any before it are banners. A dish
  // has one finishing operation, so anything at the top level above it is a
  // step with no ingredients of its own — heating an oven, lighting a grill.
  const base = Math.min(...entries.map((entry) => entry.indent));
  const topLevel = entries.filter((entry) => entry.indent === base);
  const first = topLevel[topLevel.length - 1];
  if (!first) return null;
  const rootAt = entries.indexOf(first);

  const rootSplit = splitShare(first.text);
  const root: DiagramNode = {
    text: rootSplit.rest,
    ingredientIndex: null,
    share: rootSplit.share,
    children: [],
  };
  const stack: Array<{ indent: number; node: DiagramNode }> = [
    { indent: first.indent, node: root },
  ];

  for (const entry of entries.slice(rootAt + 1)) {
    while (stack.length > 1 && entry.indent <= (stack[stack.length - 1]?.indent ?? 0)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (!parent) continue;
    const split = splitShare(entry.text);
    const node: DiagramNode = {
      text: split.rest,
      ingredientIndex: null,
      share: split.share,
      children: [],
    };
    parent.node.children.push(node);
    stack.push({ indent: entry.indent, node });
  }

  return root;
}

/** The banner lines: every top-level line above the root. */
export function parseBanners(lines: readonly string[]): string[] {
  const entries: Array<{ indent: number; text: string }> = [];
  for (const line of lines) {
    const match = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (!match) continue;
    const text = (match[2] ?? "").trim();
    if (text.length === 0) continue;
    entries.push({ indent: (match[1] ?? "").replace(/\t/g, "    ").length, text });
  }
  if (entries.length === 0) return [];
  const base = Math.min(...entries.map((entry) => entry.indent));
  const topLevel = entries.filter((entry) => entry.indent === base);
  return topLevel.slice(0, -1).map((entry) => entry.text);
}

/** Serialises a tree back to the outline, for a byte-stable round trip. */
export function serialiseDiagram(root: DiagramNode): string[] {
  const lines: string[] = [];
  const walk = (node: DiagramNode, depth: number): void => {
    const share = node.share === null ? "" : `${fractionText(node.share)} `;
    lines.push(`${"  ".repeat(depth)}- ${share}${node.text}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines;
}

/** The fraction a share was written as, for a byte-stable round trip. */
function fractionText(share: number): string {
  for (const [glyph, value] of Object.entries(GLYPH_SHARES)) {
    if (Math.abs(value - share) < 1e-9) return glyph;
  }
  for (let denominator = 2; denominator <= 8; denominator += 1) {
    const numerator = share * denominator;
    if (Math.abs(numerator - Math.round(numerator)) < 1e-9) {
      return `${Math.round(numerator)}/${denominator}`;
    }
  }
  return String(share);
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
    // A leaf carrying a share is explicitly *part* of an ingredient, so it may
    // point at one another leaf has already taken. Without a share, the
    // claim-once rule stands: a recipe using butter twice must not have both
    // leaves silently show the whole amount.
    const reusable = node.share !== null;
    const index = available.findIndex(
      (name, at) =>
        (reusable || !claimed.has(at)) &&
        (name === wanted || name.startsWith(`${wanted} `)),
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

  // Row-major: everything on row 0 first, and within a row, leftmost first —
  // which is *ascending* column, because column 0 is the leaves. Ingredients
  // read down the left edge and the operations flow right, ending at the dish.
  cells.sort((a, b) => a.row - b.row || a.column - b.column);

  const columns = rootColumn + 1;
  const rows = leafCount(root);

  const grid: PlacedNode[][] = Array.from({ length: rows }, () => []);
  for (const cell of cells) grid[cell.row]?.push(cell);

  return { root, columns, rows, cells, grid, banners: [] };
}

/**
 * Checks a diagram against the rules that can be checked.
 *
 * Three of the rules in docs/diagram.md hold by construction — an operation is
 * always right of its inputs, its inputs are always a contiguous block, and its
 * height is always its leaf count — because the tree makes them true. Two are
 * matters of judgement no program can settle: whether the row order matches the
 * method, and whether an operation is named usefully.
 *
 * What is left is the one failure that is both mechanical and invisible: an
 * ingredient the diagram forgot. A recipe with fourteen ingredients and twelve
 * leaves looks entirely reasonable, and the two that are missing are missing
 * from the reader's understanding of the dish, not merely from a table.
 */
export function validateDiagram(
  diagram: Diagram,
  ingredientNames: readonly string[],
): string[] {
  const problems: string[] = [];
  const leaves = diagram.cells.filter((cell) => cell.children.length === 0);
  const linked = new Set(
    leaves.map((leaf) => leaf.ingredientIndex).filter((index) => index !== null),
  );

  // Shares of one ingredient must add up to that ingredient. 1/3 + 1/3 is two
  // thirds of the oil going into the pan and one third going nowhere — which
  // reads as a complete diagram and is a missing tablespoon.
  const shares = new Map<number, number>();
  for (const leaf of leaves) {
    if (leaf.ingredientIndex === null || leaf.share === null) continue;
    shares.set(leaf.ingredientIndex, (shares.get(leaf.ingredientIndex) ?? 0) + leaf.share);
  }
  for (const [index, total] of shares) {
    if (Math.abs(total - 1) > 1e-6) {
      problems.push(
        `shares of ${ingredientNames[index]} add up to ${total.toFixed(2)}, not 1`,
      );
    }
  }

  for (const [index, name] of ingredientNames.entries()) {
    if (linked.has(index)) continue;
    // An ingredient split across two uses is written in words — "half the
    // butter" — so it links to nothing. It still has to be *mentioned*.
    // The bracketed count on an ingredient line — "(2 limes)" — is for the
    // reader, not part of the name, so it is dropped before looking for a
    // mention of it in the diagram.
    const bare = name
      .replace(/\(.*?\)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const mentioned = leaves.some((leaf) => leaf.text.toLowerCase().includes(bare));
    if (!mentioned) problems.push(`ingredient missing from the diagram: ${name}`);
  }

  return problems;
}

/** Everything, from an outline and a recipe's ingredients. */
export function buildDiagram(
  lines: readonly string[],
  ingredientNames: readonly string[],
): Diagram | null {
  const parsed = parseDiagram(lines);
  if (!parsed) return null;
  const placed = placeDiagram(linkIngredients(parsed, ingredientNames));
  return { ...placed, banners: parseBanners(lines) };
}

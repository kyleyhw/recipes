import { describe, expect, it } from "vitest";
import {
  buildDiagram,
  isBlank,
  linkIngredients,
  parseDiagram,
  placeDiagram,
  serialiseDiagram,
} from "@/lib/content/diagram";

/**
 * Tests for the ingredients-and-operations table.
 *
 * The load-bearing property is the geometry: an operation's cell must stand
 * exactly as tall as the ingredients it consumes, and the cells in a row must
 * span the full width. A table that fails either is not wrong in a way anyone
 * can see — it just lays out slightly oddly — which is exactly why it is worth
 * asserting rather than eyeballing.
 */

const OUTLINE = [
  "- bake",
  "  - fold",
  "    - whisk",
  "      - butter",
  "      - sugar",
  "    - stir",
  "      - flour",
  "      - salt",
  "  - walnuts",
];

describe("parsing the outline", () => {
  it("nests by indentation", () => {
    const root = parseDiagram(OUTLINE);
    expect(root?.text).toBe("bake");
    expect(root?.children.map((c) => c.text)).toEqual(["fold", "walnuts"]);
    expect(root?.children[0]?.children.map((c) => c.text)).toEqual(["whisk", "stir"]);
  });

  /** A file people edit by hand will not use one indent width forever. */
  it("accepts any consistent indent width", () => {
    const four = parseDiagram(["- a", "    - b", "        - c"]);
    expect(four?.children[0]?.children[0]?.text).toBe("c");
  });

  it("round-trips through serialisation", () => {
    const root = parseDiagram(OUTLINE);
    expect(root && serialiseDiagram(root)).toEqual(OUTLINE);
  });

  it("returns null for an empty section rather than throwing", () => {
    expect(parseDiagram([])).toBeNull();
    expect(parseDiagram(["", "   "])).toBeNull();
  });
});

describe("linking leaves to ingredients", () => {
  const NAMES = ["unsalted butter", "brown sugar", "walnuts"];

  it("resolves a leaf that names an ingredient", () => {
    const root = linkIngredients(parseDiagram(["- mix", "  - walnuts"])!, NAMES);
    expect(root.children[0]?.ingredientIndex).toBe(2);
  });

  /**
   * A wrong quantity beside the right word is worse than plain text, because it
   * looks right. So a leaf that matches nothing stays text.
   */
  it("leaves an unmatched leaf as written", () => {
    const root = linkIngredients(parseDiagram(["- mix", "  - graham crust"])!, NAMES);
    expect(root.children[0]?.ingredientIndex).toBeNull();
  });

  it("never claims one ingredient twice", () => {
    const root = linkIngredients(
      parseDiagram(["- mix", "  - walnuts", "  - walnuts"])!,
      NAMES,
    );
    const claimed = root.children.map((c) => c.ingredientIndex);
    expect(claimed[0]).toBe(2);
    expect(claimed[1]).toBeNull();
  });

  it("never resolves an operation, however it is named", () => {
    const root = linkIngredients(parseDiagram(["- walnuts", "  - brown sugar"])!, NAMES);
    expect(root.ingredientIndex).toBeNull();
  });
});

describe("placing the cells", () => {
  const placed = placeDiagram(parseDiagram(OUTLINE)!);

  it("gives one row per ingredient", () => {
    expect(placed.rows).toBe(5);
  });

  it("puts the leaves in the first column and the dish in the last", () => {
    const butter = placed.cells.find((c) => c.text === "butter");
    expect(butter?.column).toBe(0);
    expect(placed.cells.find((c) => c.text === "bake")?.column).toBe(placed.columns - 1);
  });

  /** The whole point of the form: height equals what goes in. */
  it("makes every operation as tall as the ingredients beneath it", () => {
    const byText = new Map(placed.cells.map((c) => [c.text, c]));
    expect(byText.get("bake")?.rowSpan).toBe(5);
    // fold takes in four ingredients; the walnuts are its sibling, not its child.
    expect(byText.get("fold")?.rowSpan).toBe(4);
    expect(byText.get("whisk")?.rowSpan).toBe(2);
    expect(byText.get("stir")?.rowSpan).toBe(2);
    expect(byText.get("walnuts")?.rowSpan).toBe(1);
  });

  /**
   * Every row must account for every column, whether with a cell of its own, a
   * cell spanning down from above, or a blank. A row that is short leaves a
   * hole, and a table with holes is laid out however the browser feels like.
   */
  it("accounts for every column on every row", () => {
    for (let row = 0; row < placed.rows; row += 1) {
      const spanningFromAbove = placed.cells.filter(
        (c) => c.row < row && c.row + c.rowSpan > row,
      ).length;
      expect(placed.grid[row]!.length + spanningFromAbove, `row ${row}`).toBe(
        placed.columns,
      );
    }
  });

  /**
   * Rule 8. A stretched ingredient makes the left column ragged and reads as
   * though the ingredient were itself an operation.
   */
  it("leaves gaps blank rather than stretching an ingredient across them", () => {
    const walnuts = placed.grid.flat().find((c) => !isBlank(c) && c.text === "walnuts");
    expect(walnuts && !isBlank(walnuts) && walnuts.column).toBe(0);
    // walnuts sits three columns from the root, so its row carries blanks.
    const row = placed.grid[4]!;
    expect(row.filter(isBlank).length).toBeGreaterThan(0);
  });

  it("emits cells left to right within a row", () => {
    const firstRow = placed.cells.filter((c) => c.row === 0);
    const columns = firstRow.map((c) => c.column);
    expect(columns).toEqual([...columns].sort((a, b) => a - b));
  });

  it("keeps every ingredient in the first column", () => {
    for (const cell of placed.cells.filter((c) => c.children.length === 0)) {
      expect(cell.column, cell.text).toBe(0);
    }
  });
});

describe("building the whole thing", () => {
  it("returns null when there is no diagram", () => {
    expect(buildDiagram([], ["butter"])).toBeNull();
  });

  it("produces a table whose cells account for every node", () => {
    const diagram = buildDiagram(OUTLINE, ["butter", "sugar", "flour", "salt", "walnuts"]);
    expect(diagram?.cells).toHaveLength(9);
  });
});

describe("the shipped collection", () => {
  /**
   * The rules in docs/diagram.md that a program can check, checked against the
   * real recipes rather than a fixture. A diagram that has quietly dropped an
   * ingredient looks entirely reasonable on the page, which is the whole reason
   * this is a test and not a review.
   */
  it("has a diagram for every recipe, and every diagram names every ingredient", async () => {
    const { loadCollection } = await import("@/lib/content/library");
    const { parseIngredientLine } = await import("@/lib/ingredient-parser");
    const { validateDiagram } = await import("@/lib/content/diagram");

    const { recipes, problems } = loadCollection();
    expect(problems, problems.map((p) => `${p.file}: ${p.error}`).join("\n")).toEqual([]);
    expect(recipes.length).toBeGreaterThan(0);

    for (const recipe of recipes) {
      const names = recipe.ingredients.map((line) => parseIngredientLine(line).name);
      const diagram = buildDiagram(recipe.diagram, names);
      expect(diagram, `${recipe.slug} has no diagram`).not.toBeNull();
      expect(validateDiagram(diagram!, names), recipe.slug).toEqual([]);

      // Rule 1: one row per ingredient, at least. Splits add rows, never
      // remove them.
      expect(diagram!.rows, recipe.slug).toBeGreaterThanOrEqual(names.length);

      // Rule 2: column 0 is ingredients and nothing else.
      for (const cell of diagram!.cells) {
        if (cell.children.length > 0) expect(cell.column, cell.text).toBeGreaterThan(0);
        else expect(cell.column, cell.text).toBe(0);
      }
    }
  });
});

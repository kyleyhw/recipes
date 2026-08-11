"use client";

import { useT } from "@/components/language";
import type { Diagram } from "@/lib/content/diagram";

/**
 * The recipe as a table of ingredients and operations.
 *
 * A real `<table>`, not a grid of divs, and the reason is `rowspan`. The whole
 * point of the form is that an operation's cell stands exactly as tall as the
 * ingredients it consumes — that vertical alignment *is* the information — and
 * rowspan is the one layout primitive that expresses it without measuring
 * anything. A CSS grid would need every span computed in pixels and would come
 * apart the moment a label wrapped.
 *
 * ## What it is told about the recipe
 *
 * Nothing. The leaves arrive already resolved to lines of text by the caller,
 * so the diagram shows the scaled quantity and the translated name without
 * knowing that scaling or translation exist.
 *
 * ## On a phone
 *
 * It scrolls sideways inside its own box rather than reflowing. A tree with
 * four levels does not have a one-column form — flattening it back into a list
 * would be a numbered method, which the page already has directly above.
 */
export function RecipeDiagram({
  diagram,
  lines,
}: {
  diagram: Diagram;
  /** Text for each leaf, by ingredient index. Falls back to the leaf's own text. */
  lines: Record<number, string>;
}) {
  const t = useT();

  const rows: Array<typeof diagram.cells> = Array.from({ length: diagram.rows }, () => []);
  for (const cell of diagram.cells) rows[cell.row]?.push(cell);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
        {t("diagram")}
      </h2>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">{t("diagramCaption")}</caption>
          <tbody>
            {rows.map((cells, index) => (
              <tr key={index}>
                {cells.map((cell) => {
                  const isLeaf = cell.children.length === 0;
                  const text =
                    cell.ingredientIndex !== null
                      ? (lines[cell.ingredientIndex] ?? cell.text)
                      : cell.text;

                  return (
                    <td
                      key={`${cell.row}-${cell.column}-${cell.text}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className={[
                        "border border-border px-2 py-1.5 align-middle",
                        // Ingredients read as data and operations as
                        // instructions, so they are weighted differently: the
                        // eye should be able to find the left edge of the tree
                        // without reading any of it.
                        isLeaf
                          ? "min-w-40 text-text"
                          : "min-w-24 bg-surface-2 text-center font-medium text-text-muted",
                      ].join(" ")}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-text-muted">{t("diagramNote")}</p>
    </section>
  );
}

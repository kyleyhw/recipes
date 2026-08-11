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
  line,
  title,
  servings,
}: {
  diagram: Diagram;
  /** Shown in the bar across the top, with the serving count beside it. */
  title: string;
  servings: string;
  /**
   * The text for a leaf: the ingredient at that index, scaled and translated,
   * and reduced to `share` of itself where the leaf takes only part of it.
   */
  line: (index: number, share: number | null) => string | null;
}) {
  const t = useT();

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
        {t("diagram")}
      </h2>

      <div className="overflow-x-auto">
        <table className="border-collapse border border-rule text-xs">
          <caption className="sr-only">{t("diagramCaption")}</caption>
          <tbody>
            {/* The title bar. Inside the table rather than above it, so it is
                as wide as the diagram is and scrolls with it — and it carries
                the serving count, which is the one number the whole table is
                drawn at. */}
            <tr>
              <th
                colSpan={diagram.columns}
                scope="colgroup"
                className="border border-rule px-2.5 py-1.5 text-left font-semibold"
              >
                {title} <span className="numeric font-normal">({servings})</span>
              </th>
            </tr>

            {/* Operations with no ingredients — heating an oven — span the
                full width above everything, because they have no rows to
                stand against. */}
            {diagram.banners.map((banner) => (
              <tr key={banner}>
                <td
                  colSpan={diagram.columns}
                  className="border border-rule px-2.5 py-1.5 text-center"
                >
                  {banner}
                </td>
              </tr>
            ))}

            {diagram.grid.map((row, index) => (
              <tr key={index}>
                {row.map((cell) => {
                  const isLeaf = cell.children.length === 0;
                  const text =
                    cell.ingredientIndex !== null
                      ? (line(cell.ingredientIndex, cell.share) ?? cell.text)
                      : cell.text;

                  return (
                    <td
                      key={`${cell.row}-${cell.column}-${cell.text}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      // One fill for every cell. Position says which is an
                      // ingredient and which is an operation — the left column
                      // is ingredients and nothing else — so colouring them
                      // differently states twice what the layout already says.
                      className={[
                        "border border-rule px-2.5 py-1 align-middle",
                        isLeaf ? "min-w-40 text-left" : "text-center",
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

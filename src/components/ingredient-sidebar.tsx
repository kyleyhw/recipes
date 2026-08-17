"use client";

import { useMemo, useState } from "react";
import type { LibraryIngredient } from "@/lib/content/library";
import { useT } from "@/components/language";
import { decimal, decimalOrDash } from "@/lib/format";

/**
 * The ingredient library, as a drawer.
 *
 * It is reference material — you consult it when a macro figure looks wrong, or
 * when adding an ingredient that did not resolve — so it does not deserve a
 * place in the navigation beside the recipes themselves. Collapsed, it costs
 * one word in the header; open, it is the whole table.
 *
 * Closed by default and rendered only when opened, so the table's markup is not
 * in the document for the overwhelming majority of visits that never ask for
 * it.
 *
 * `/ingredients` still exists as a page. A drawer cannot be linked to, and the
 * library is exactly the sort of thing worth sending someone a link to.
 */
export function IngredientSidebar({ ingredients }: { ingredients: LibraryIngredient[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const t = useT();

  const trimmed = query.trim().toLowerCase();
  const matching = useMemo(
    () =>
      trimmed.length === 0
        ? ingredients
        : ingredients.filter((ingredient) =>
            ingredient.name.toLowerCase().includes(trimmed),
          ),
    [ingredients, trimmed],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-text-muted hover:text-accent"
        aria-expanded={open}
      >
        {t("ingredients")}
      </button>

      {open ? (
        <>
          {/* The scrim is a button rather than a div so that clicking away is
              reachable from a keyboard, not only a pointer. */}
          <button
            type="button"
            aria-label={t("closeLibrary")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/50"
          />
          {/* `whitespace-normal` undoes an inheritance, and it is load-bearing.
              The button that opens this drawer lives in the header, which sets
              `whitespace-nowrap` so the category links scroll sideways at phone
              width instead of wrapping. The drawer is `fixed`, so it looks
              unrelated — but it is still a DOM descendant of that header, and
              it inherited the rule. Every note in here was being laid out on
              one line and clipped at the edge with no scrollbar and no
              ellipsis: present in the HTML, invisible on the screen. */}
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg whitespace-normal shadow-2xl"
            aria-label="Ingredient library"
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold tracking-wide uppercase">
                {t("ingredients")}
                <span className="numeric ml-2 font-normal text-text-muted">
                  {ingredients.length}
                </span>
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <a href="/ingredients" className="text-text-muted hover:text-accent">
                  {t("fullPage")}
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-text-muted hover:text-text"
                >
                  {t("close")}
                </button>
              </div>
            </div>

            <div className="border-b border-border px-4 py-3">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("findIngredient")}
                aria-label={t("findIngredient")}
                className="w-full rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="mb-3 text-xs text-text-muted">{t("per100Note")}</p>
              <ul className="flex flex-col divide-y divide-border">
                {matching.map((ingredient) => (
                  <li key={ingredient.name} className="py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{ingredient.name}</span>
                      <span className="numeric shrink-0 text-sm text-text-muted">
                        {decimal(ingredient.kcal100g, 1)} kcal
                      </span>
                    </div>
                    <p className="numeric mt-0.5 text-xs text-text-muted">
                      P {decimal(ingredient.protein100g, 1)} · C{" "}
                      {decimal(ingredient.carbs100g, 1)} · F{" "}
                      {decimal(ingredient.fat100g, 1)}
                      {ingredient.densityGPerMl
                        ? ` · ρ ${decimalOrDash(ingredient.densityGPerMl)}`
                        : ""}
                      {ingredient.gramsPerUnit
                        ? ` · μ ${decimalOrDash(ingredient.gramsPerUnit, 1)} g`
                        : ""}
                    </p>
                    {/* How to keep what the recipe did not use. First, and in
                        the stronger colour: it is the thing you need while the
                        rest of the bunch is still on the counter, whereas the
                        provenance of a figure is something you look up later. */}
                    {ingredient.keeping ? (
                      <p className="mt-1 text-xs text-text-muted">
                        <span className="font-medium">{t("keeping")}</span>
                        {" — "}
                        {ingredient.keeping}
                      </p>
                    ) : null}
                    {/* Every figure is a magic number, and must be traceable to
                        where it came from. */}
                    {ingredient.sourceNote ? (
                      <p className="mt-0.5 text-xs text-text-muted/70">
                        {ingredient.sourceNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {matching.length === 0 ? (
                <p className="text-sm text-text-muted">{t("noIngredientMatched")}</p>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

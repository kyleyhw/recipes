"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LibraryIngredient } from "@/lib/content/library";
import type { IngredientUse } from "@/lib/content/prepare";
import { useT } from "@/components/language";
import { decimal, decimalOrDash } from "@/lib/format";

/**
 * The ingredient library, as a drawer that anything on the page can open.
 *
 * It began as a header button with its own state, which was right while the
 * only way in was that button. Once an ingredient line on a recipe became a way
 * in — click "20 g garlic" and see where its figures come from — the state had
 * to move somewhere both the header and the recipe body could reach, and this
 * provider is that somewhere.
 *
 * Still closed by default and still rendered only when opened, so the table's
 * markup is not in the document for the overwhelming majority of visits that
 * never ask for it. The data is in the payload either way, which is the price
 * of a static site with no request-time fetching.
 *
 * `/ingredients` still exists as a page. A drawer cannot be linked to, and the
 * library is exactly the sort of thing worth sending someone a link to.
 */

interface LibraryControl {
  /** Opens the drawer, optionally filtered to one ingredient by library name. */
  open: (name?: string) => void;
  /** Closes it. Following a link out of the drawer has to, or the panel and its
      scrim sit over the recipe you just asked for. */
  close: () => void;
}

const LibraryContext = createContext<LibraryControl | null>(null);

/**
 * The opener, for anything inside the provider.
 *
 * Returns null outside one rather than throwing. A component that offers "see
 * this ingredient" should degrade to plain text where there is no drawer to
 * open — an export, a test render — not take the page down.
 */
export function useIngredientLibrary(): LibraryControl | null {
  return useContext(LibraryContext);
}

export function IngredientLibraryProvider({
  ingredients,
  usedIn,
  children,
}: {
  ingredients: LibraryIngredient[];
  /** Which recipes use each ingredient, keyed by library name. */
  usedIn: Record<string, IngredientUse[]>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const control = useMemo<LibraryControl>(
    () => ({
      close: () => setOpen(false),
      open: (name?: string) => {
        // Opening at an ingredient sets the search box rather than scrolling to
        // a row, and does it visibly. A drawer that silently jumped to one entry
        // out of 163 would leave no way back to the rest of them; a filled
        // search box is a filter you can see, and clearing it is the way out.
        setQuery(name ?? "");
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <LibraryContext.Provider value={control}>
      {children}
      {open ? (
        <LibraryDrawer
          ingredients={ingredients}
          usedIn={usedIn}
          query={query}
          onQuery={setQuery}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </LibraryContext.Provider>
  );
}

/** The header's way in: the whole library, unfiltered. */
export function IngredientLibraryButton() {
  const library = useIngredientLibrary();
  const t = useT();

  return (
    <button
      type="button"
      onClick={() => library?.open()}
      className="text-sm text-text-muted hover:text-accent"
    >
      {t("ingredients")}
    </button>
  );
}

function LibraryDrawer({
  ingredients,
  usedIn,
  query,
  onQuery,
  onClose,
}: {
  ingredients: LibraryIngredient[];
  usedIn: Record<string, IngredientUse[]>;
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const trimmed = query.trim().toLowerCase();

  // Substring, then exact match first. Opening at "garlic" must not bury it
  // under "garlic powder", and typing "oil" should still show every oil.
  const matching = useMemo(() => {
    if (trimmed.length === 0) return ingredients;
    const hits = ingredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(trimmed),
    );
    return [...hits].sort((a, b) => {
      const exact = (name: string) => (name.toLowerCase() === trimmed ? 0 : 1);
      return exact(a.name) - exact(b.name);
    });
  }, [ingredients, trimmed]);

  return (
    <>
      {/* The scrim is a button rather than a div so that clicking away is
          reachable from a keyboard, not only a pointer. */}
      <button
        type="button"
        aria-label={t("closeLibrary")}
        onClick={onClose}
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
            {/* `Link` rather than a bare anchor: it applies the base path a
                project page is served under, which a hand-written href does
                not. */}
            <Link href="/ingredients" className="text-text-muted hover:text-accent">
              {t("fullPage")}
            </Link>
            <button
              type="button"
              onClick={onClose}
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
            onChange={(event) => onQuery(event.target.value)}
            placeholder={t("findIngredient")}
            aria-label={t("findIngredient")}
            className="w-full rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-xs text-text-muted">{t("per100Note")}</p>
          <ul className="flex flex-col divide-y divide-border">
            {matching.map((ingredient) => (
              <li key={ingredient.name} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{ingredient.name}</span>
                  <span className="numeric shrink-0 text-sm text-text-muted">
                    {decimal(ingredient.kcal100g, 1)} kcal
                  </span>
                </div>
                <p className="numeric mt-0.5 text-xs text-text-muted">
                  P {decimal(ingredient.protein100g, 1)} · C{" "}
                  {decimal(ingredient.carbs100g, 1)} · F {decimal(ingredient.fat100g, 1)}
                  {ingredient.densityGPerMl
                    ? ` · ρ ${decimalOrDash(ingredient.densityGPerMl)}`
                    : ""}
                  {ingredient.gramsPerUnit
                    ? ` · μ ${decimalOrDash(ingredient.gramsPerUnit, 1)} g${
                        ingredient.unitName ? ` / ${ingredient.unitName}` : ""
                      }`
                    : ""}
                </p>
                {/* How to make it, for the things nobody makes from scratch.
                    A rate rather than an amount: the amount is on whatever
                    recipe line sent you here. */}
                {ingredient.madeUp ? (
                  <p className="mt-1 text-xs text-text-muted">
                    <span className="font-medium">{t("madeUp")}</span>
                    {" — "}
                    {t("madeUpRate", {
                      unit: ingredient.madeUp.unitName,
                      ml: String(ingredient.madeUp.perMl),
                    })}
                    {ingredient.madeUp.note ? ` ${ingredient.madeUp.note}` : ""}
                  </p>
                ) : null}
                {/* The three notes, all folded, all the same shape.
                    They used to run open one under the other, and between them
                    a keeping note and a source note came to twenty lines of
                    prose a row: three ingredients filled the drawer and the
                    list underneath could not be scanned at all. Worse, the two
                    paragraphs were set almost identically, so the provenance
                    of a figure read as a continuation of the storage advice.

                    Folded, a row is its name, its figures and three labels, and
                    the answer to any of them is one click away. `UsedIn` was
                    already a `<details>` for exactly this argument; this is the
                    same argument applied to the two paragraphs that were
                    longer than it.

                    Storage stays first and in the stronger colour, which is
                    what the note it replaces was protecting: it is the thing
                    you need while the rest of the bunch is on the counter. The
                    full page is the unfolded view — see the note there — and
                    the link to it is in this drawer's header. */}
                <div className="mt-1.5 flex flex-col gap-1">
                  {ingredient.keeping ? (
                    <FoldedNote label={t("keeping")} prominent>
                      {ingredient.keeping}
                    </FoldedNote>
                  ) : null}
                  {ingredient.sourceNote ? (
                    <FoldedNote label={t("figuresFrom")}>
                      {ingredient.sourceNote}
                    </FoldedNote>
                  ) : null}
                  <UsedIn uses={usedIn[ingredient.name] ?? []} />
                </div>
              </li>
            ))}
          </ul>
          {matching.length === 0 ? (
            <p className="text-sm text-text-muted">{t("noIngredientMatched")}</p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

/**
 * A labelled note that opens on click.
 *
 * The same markup as `UsedIn` below, so the three disclosures on a row line up
 * and behave alike. A `<details>` rather than React state for the same reason:
 * it works with no JavaScript, and a row is markup rather than a widget.
 *
 * `prominent` is the difference between the storage note and the provenance
 * one. Both fold; the first is the one you want at the counter, so it keeps the
 * stronger colour it had when it was the only one showing.
 */
function FoldedNote({
  label,
  prominent = false,
  children,
}: {
  label: string;
  prominent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="text-xs">
      <summary
        className={`cursor-pointer marker:text-text-muted/60 hover:text-accent ${
          prominent ? "text-text-muted" : "text-text-muted/70"
        }`}
      >
        {label}
      </summary>
      <p className="mt-1 ml-4 text-text-muted">{children}</p>
    </details>
  );
}

/**
 * What uses this ingredient, folded away.
 *
 * A `<details>` rather than React state, so it works with no JavaScript and
 * needs none: the same markup serves the drawer and the full page. Folded
 * because a row is a nutrition record first — the answer to "is this figure
 * right?" — and the list of dishes is the second question, asked by a different
 * person on a different day.
 */
export function UsedIn({ uses }: { uses: readonly IngredientUse[] }) {
  const t = useT();
  const library = useIngredientLibrary();

  if (uses.length === 0) {
    return <p className="mt-1 text-xs text-text-muted/70">{t("usedInNothing")}</p>;
  }

  return (
    <details className="mt-1 text-xs text-text-muted">
      <summary className="cursor-pointer marker:text-text-muted/60 hover:text-accent">
        {t("usedIn", { n: String(uses.length) })}
      </summary>
      <ul className="mt-1 ml-4 flex flex-col gap-1">
        {uses.map((use) => (
          <li key={use.slug}>
            {/* Underlined, and in the text colour rather than the muted one.
                These were anchors from the start and read as a plain list,
                which is the same as not being links at all: a link nobody can
                see is a link nobody clicks. Marked the way the ingredient
                lines on a recipe page are, since they do the same job. */}
            <Link
              href={`/recipes/${use.slug}`}
              onClick={() => library?.close()}
              className="text-text underline decoration-border decoration-dotted underline-offset-4 hover:text-accent hover:decoration-accent"
            >
              {use.title}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

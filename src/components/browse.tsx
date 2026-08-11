"use client";

import { useMemo, useState } from "react";
import { RecipeCard } from "@/components/recipe-card";
import {
  shelveRecipes,
  SORT_LABELS,
  type RecipeSummary,
  type SortKey,
} from "@/lib/content/summary";

/**
 * Browsing, searching and arranging the collection.
 *
 * Search and sort are both client-side, over summaries embedded in the page.
 * On the server build search was Postgres full-text; here there is no server to
 * ask, so the index travels with the page. That is affordable at the size of a
 * personal collection — a few hundred recipes of title, ingredients and tags is
 * tens of kilobytes — and stops being affordable in the low thousands, which is
 * noted so the point where it breaks is known rather than discovered.
 *
 * Every figure a sort reads was computed at build time (`content/summary.ts`).
 * Sorting by protein per serving in the browser would otherwise mean shipping
 * the ingredient library and the whole nutrition pipeline to re-derive, on
 * every page load, a number that cannot change between deploys.
 *
 * Without JavaScript the shelves still render, because the page is prerendered
 * in its default arrangement; only the controls go away.
 */
export function Browse({
  recipes,
  categoryOrder,
  glyphs,
  heading,
}: {
  recipes: RecipeSummary[];
  categoryOrder: string[];
  glyphs: Record<string, string>;
  /** Shown above the listing. Absent on the home page, where the shelves say it. */
  heading?: string | undefined;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("category");

  const trimmed = query.trim().toLowerCase();

  const matching = useMemo(() => {
    if (trimmed.length === 0) return recipes;
    // Every word must appear somewhere in the recipe: "lemon chicken" should
    // not match a recipe that is merely lemony, nor every chicken recipe.
    const words = trimmed.split(/\s+/);
    return recipes.filter((recipe) =>
      words.every((word) => recipe.haystack.includes(word)),
    );
  }, [recipes, trimmed]);

  const shelves = useMemo(
    () => shelveRecipes(matching, sort, categoryOrder),
    [matching, sort, categoryOrder],
  );

  // Protein is the one sort whose figure is worth showing on the card: ranking
  // by a number the reader cannot see is a ranking they have to take on trust.
  const showProtein = sort === "protein-desc";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, ingredients and tags"
          aria-label="Search recipes"
          className="min-w-48 flex-1 rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <span className="sr-only sm:not-sr-only">Arrange by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Arrange recipes by"
            className="rounded-card border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-accent"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {trimmed.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-card border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            Clear
          </button>
        ) : null}
      </div>

      {heading ? (
        <h1 className="mb-4 text-lg font-semibold tracking-tight">{heading}</h1>
      ) : null}

      {trimmed.length > 0 ? (
        <p className="mb-4 text-sm text-text-muted">
          {matching.length} result{matching.length === 1 ? "" : "s"} for “{query.trim()}”
        </p>
      ) : null}

      {matching.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing matched. Search covers titles, descriptions, cuisines, tags and
          ingredient lines.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {shelves.map((shelf) => (
            <section key={shelf.name || "all"}>
              {shelf.name ? (
                <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                  {shelf.name}
                  <span className="numeric ml-2 font-normal text-text-muted">
                    {shelf.recipes.length}
                  </span>
                </h2>
              ) : null}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {shelf.recipes.map((recipe) => (
                  <li key={recipe.slug}>
                    <RecipeCard
                      recipe={recipe}
                      glyph={glyphs[recipe.category] ?? "*"}
                      showProtein={showProtein}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useLanguage, useT } from "@/components/language";
import { RecipeCard } from "@/components/recipe-card";
import { SortMenu } from "@/components/sort-menu";
import { DietMenu } from "@/components/diet-menu";
import {
  dietCounts,
  filterOptions,
  filterRecipes,
  NO_FILTERS,
  shelveRecipes,
  UNATTRIBUTED_SHELF,
  type FilterField,
  type Filters,
  type RecipeSummary,
  type SortKey,
} from "@/lib/content/summary";
import { translate, translateCategory, type StringKey } from "@/lib/i18n/strings";
import type { DietKey } from "@/lib/content/diet";

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
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const t = useT();
  const language = useLanguage();

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

  // Filters narrow what the search already matched, and the options offered
  // are gathered from everything on the page rather than from what is left
  // after filtering — a menu whose contents change as you use it is a menu you
  // cannot find your way back through.
  const narrowed = useMemo(() => filterRecipes(matching, filters), [matching, filters]);

  const options = useMemo(
    () => ({
      cuisine: filterOptions(recipes, "cuisine"),
      addedBy: filterOptions(recipes, "addedBy"),
    }),
    [recipes],
  );

  const diets = useMemo(() => dietCounts(recipes), [recipes]);

  const shelves = useMemo(
    () => shelveRecipes(narrowed, sort, categoryOrder),
    [narrowed, sort, categoryOrder],
  );

  const active = (["cuisine", "addedBy"] as const).flatMap((field) => {
    const value = filters[field];
    return value === null ? [] : [{ field, value }];
  });

  function dropDiet(key: DietKey): void {
    setFilters((current) => ({
      ...current,
      diets: current.diets.filter((diet) => diet !== key),
    }));
  }

  function setFilter(field: FilterField, value: string | null): void {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  // Protein is the one sort whose figure is worth showing on the card: ranking
  // by a number the reader cannot see is a ranking they have to take on trust.
  const showProtein = sort === "protein-desc" || sort === "protein-asc";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="min-w-48 flex-1 rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <SortMenu
          value={sort}
          onChange={setSort}
          filters={filters}
          onFilter={setFilter}
          options={options}
        />
        <DietMenu
          value={filters.diets}
          onChange={(next) => setFilters((current) => ({ ...current, diets: next }))}
          counts={diets}
        />
        {trimmed.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-card border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            {t("clear")}
          </button>
        ) : null}
      </div>

      {heading ? (
        <h1 className="mb-4 text-lg font-semibold tracking-tight">{heading}</h1>
      ) : null}

      {/* An active filter has to be visible outside the menu that set it, and
          removable without going back into it. A listing quietly showing a
          third of itself is the same failure as a search box you cannot see
          the contents of. */}
      {active.length > 0 || filters.diets.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* A dietary filter has to be visible outside the menu even more than
              a cuisine does: it is the one that can hide most of the
              collection, and someone who set it three pages ago will otherwise
              read the gap as the collection being small. */}
          {filters.diets.map((diet) => (
            <button
              key={diet}
              type="button"
              onClick={() => dropDiet(diet)}
              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-text-muted hover:text-text"
            >
              {translate(language, `diet.${diet}` as StringKey)}
              <span aria-hidden="true" className="ml-2">
                ×
              </span>
            </button>
          ))}
          {active.map(({ field, value }) => (
            <button
              key={`${field}-${value}`}
              type="button"
              onClick={() => setFilter(field, null)}
              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-text-muted hover:text-text"
            >
              {value === UNATTRIBUTED_SHELF
                ? t("unattributed")
                : translateCategory(language, value)}
              <span aria-hidden="true" className="ml-2">
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {trimmed.length > 0 ? (
        <p className="mb-4 text-sm text-text-muted">
          {t("resultsFor", { n: narrowed.length, q: query.trim() })}
        </p>
      ) : null}

      {narrowed.length === 0 ? (
        <p className="text-sm text-text-muted">{t("nothingMatched")}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {shelves.map((shelf) => (
            <section key={shelf.name || "all"}>
              {shelf.name ? (
                <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                  {/* A shelf is named after a category or a cuisine. The first
                      the string table knows; the second is whatever the recipe
                      file says, and is left alone. */}
                  {shelf.name === UNATTRIBUTED_SHELF
                    ? t("unattributed")
                    : translateCategory(language, shelf.name)}
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

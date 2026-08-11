"use client";

import { useMemo, useState } from "react";
import { RecipeCard } from "@/components/recipe-card";
import type { RecipeFile } from "@/lib/content/format";

/**
 * Browsing and searching the collection.
 *
 * Search is client-side, over the whole collection, which is embedded in the
 * page. On the server build this was Postgres full-text search behind a GET
 * form; here there is no server to ask, so the index travels with the page.
 *
 * That is affordable because of what is indexed and how many there are: a few
 * hundred recipes of title, ingredients and tags is tens of kilobytes, and the
 * match is a substring scan over it. It stops being affordable in the low
 * thousands, at which point a prebuilt index would be the next step — noted
 * because the point where this breaks should be known rather than discovered.
 *
 * Without JavaScript the shelves still render, because the page is prerendered;
 * only the filter goes away.
 */
export function Browse({
  recipes,
  categories,
}: {
  recipes: RecipeFile[];
  categories: Array<{ name: string; glyph: string }>;
}) {
  const [query, setQuery] = useState("");

  const haystacks = useMemo(
    () =>
      new Map(
        recipes.map((recipe) => [
          recipe.slug,
          [
            recipe.title,
            recipe.description ?? "",
            recipe.category,
            recipe.tags.join(" "),
            recipe.ingredients.join(" "),
          ]
            .join(" ")
            .toLowerCase(),
        ]),
      ),
    [recipes],
  );

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (trimmed.length === 0) return null;
    // Every word must appear somewhere in the recipe: "lemon chicken" should
    // not match a recipe that is merely lemony, nor every chicken recipe.
    const words = trimmed.split(/\s+/);
    return recipes.filter((recipe) => {
      const haystack = haystacks.get(recipe.slug) ?? "";
      return words.every((word) => haystack.includes(word));
    });
  }, [recipes, haystacks, trimmed]);

  const glyphFor = (category: string): string =>
    categories.find((entry) => entry.name === category)?.glyph ?? "*";

  return (
    <div>
      <div className="mb-6 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, ingredients and tags"
          aria-label="Search recipes"
          className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        {trimmed.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-card border border-border bg-surface-2 px-4 py-2 text-sm font-medium"
          >
            Clear
          </button>
        ) : null}
      </div>

      {results ? (
        <section>
          <h1 className="mb-3 text-lg font-semibold tracking-tight">
            {results.length} result{results.length === 1 ? "" : "s"}
          </h1>
          {results.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing matched. Search covers titles, descriptions, tags and ingredient
              lines.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((recipe) => (
                <li key={recipe.slug}>
                  <RecipeCard recipe={recipe} glyph={glyphFor(recipe.category)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          {categories
            .map((category) => ({
              category,
              recipes: recipes.filter((recipe) => recipe.category === category.name),
            }))
            // Empty categories are noise on the browse page.
            .filter((shelf) => shelf.recipes.length > 0)
            .map((shelf) => (
              <section key={shelf.category.name}>
                <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                  {shelf.category.name}
                  <span className="numeric ml-2 font-normal text-text-muted">
                    {shelf.recipes.length}
                  </span>
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shelf.recipes.map((recipe) => (
                    <li key={recipe.slug}>
                      <RecipeCard recipe={recipe} glyph={shelf.category.glyph} />
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

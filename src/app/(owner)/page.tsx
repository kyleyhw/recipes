import Link from "next/link";
import { RecipeCard } from "@/components/recipe-card";
import { browseByCategory, searchRecipes } from "@/lib/recipes";

/**
 * Browse and search.
 *
 * Search is a GET form writing to the `q` query parameter rather than client
 * state, so a search is a URL: shareable, bookmarkable, and restored by the
 * back button without any client-side code.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const isSearching = query.length > 0;

  const [results, shelves] = await Promise.all([
    isSearching ? searchRecipes(query) : Promise.resolve([]),
    isSearching ? Promise.resolve([]) : browseByCategory(),
  ]);

  const total = shelves.reduce((sum, shelf) => sum + shelf.recipes.length, 0);

  return (
    <div>
      <form action="/" method="get" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search titles and ingredients"
          aria-label="Search recipes"
          className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-card border border-border bg-surface-2 px-4 py-2 text-sm font-medium"
        >
          Search
        </button>
      </form>

      {isSearching ? (
        <section>
          <div className="mb-3 flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
            </h1>
            <Link href="/" className="text-sm text-text-muted hover:text-text">
              Clear
            </Link>
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing matched. Search covers recipe titles, descriptions, notes, and
              ingredient lines.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard recipe={recipe} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : total === 0 ? (
        <div className="rounded-card border border-dashed border-border px-6 py-12 text-center">
          <h1 className="text-lg font-semibold tracking-tight">No recipes yet</h1>
          <p className="mt-1 text-sm text-text-muted">
            Add one by hand, or paste an existing recipe to import it.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/recipes/new"
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              New recipe
            </Link>
            <Link
              href="/import"
              className="rounded-card border border-border px-4 py-2 text-sm font-medium"
            >
              Import
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* The application holds recipes that exist nowhere else, so the
              backup is offered where the collection is, not buried. */}
          <p className="text-xs text-text-muted">
            <a href="/api/collection" download className="underline hover:text-text">
              Export the whole collection
            </a>{" "}
            as a single file. The import page reads it back.
          </p>
          {shelves
            // Categories with nothing in them are noise on the browse page;
            // they remain selectable in the editor.
            .filter((shelf) => shelf.recipes.length > 0)
            .map((shelf) => (
              <section key={shelf.id}>
                <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                  {shelf.name}
                  <span className="numeric ml-2 font-normal text-text-muted">
                    {shelf.recipes.length}
                  </span>
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shelf.recipes.map((recipe) => (
                    <li key={recipe.id}>
                      <RecipeCard recipe={recipe} />
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

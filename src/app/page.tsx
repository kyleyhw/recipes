import Link from "next/link";
import { Browse } from "@/components/browse";
import { loadCollection } from "@/lib/content/library";
import { summarise } from "@/lib/content/summary";

/**
 * The collection.
 *
 * Generated at build time from `content/recipes/*.md`. Any file that failed to
 * parse is reported here rather than silently omitted — a recipe that vanished
 * because of a typo in its front matter is the worst failure this site can
 * have, and the only defence on a static site is to say so where it will be
 * seen.
 */
export default function BrowsePage() {
  const { recipes, categories, ingredients, attribution, problems } = loadCollection();
  // Summarised at build time so the browser can sort by protein per serving
  // without shipping the ingredient library and the nutrition pipeline.
  const summaries = recipes.map((recipe) =>
    summarise(recipe, ingredients, attribution[recipe.slug] ?? null),
  );
  const glyphs = Object.fromEntries(categories.map((c) => [c.name, c.glyph]));

  return (
    <div>
      {problems.length > 0 ? (
        <div
          className="mb-6 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn"
          role="alert"
        >
          <p className="font-medium">
            {problems.length} file{problems.length === 1 ? "" : "s"} could not be read and{" "}
            {problems.length === 1 ? "is" : "are"} missing from this site:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem.file}>
                <code>{problem.file}</code> — {problem.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recipes.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-6 py-12 text-center">
          <h1 className="text-lg font-semibold tracking-tight">No recipes yet</h1>
          <p className="mt-1 text-sm text-text-muted">
            Recipes are Markdown files in <code>content/recipes/</code>. Add one and push;
            the site rebuilds itself.
          </p>
          <Link
            href="/ingredients"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            See the ingredient library
          </Link>
        </div>
      ) : (
        <Browse
          recipes={summaries}
          categoryOrder={categories.map((c) => c.name)}
          glyphs={glyphs}
        />
      )}
    </div>
  );
}

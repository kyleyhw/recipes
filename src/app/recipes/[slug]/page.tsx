import { notFound } from "next/navigation";
import { RecipeView } from "@/components/recipe-view";
import { SourceLine } from "@/components/source-line";
import { ExportLinks } from "@/components/export-links";
import { recipeFilename } from "@/lib/content/format";
import { loadCollection } from "@/lib/content/library";
import { prepareRecipe } from "@/lib/content/prepare";
import { placeholderStyle } from "@/lib/photos/placeholder";
import { repoUrl } from "@/lib/site";

/**
 * One recipe.
 *
 * Prerendered at build time, one HTML file per recipe. The ingredients, the
 * method and the macro panel are handed to a client component so the serving
 * count can be changed without a server; everything else is static.
 *
 * The log and the history are no longer built by this application — they are
 * the file's own git history, and the links at the bottom go to it. That is the
 * whole point of the file format: the features that took two database tables
 * and a diff renderer to provide are now provided by the thing the recipe lives
 * in.
 */

export function generateStaticParams(): Array<{ slug: string }> {
  return loadCollection().recipes.map((recipe) => ({ slug: recipe.slug }));
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { recipes, ingredients, categories } = loadCollection();
  const recipe = recipes.find((entry) => entry.slug === slug);
  if (!recipe) notFound();

  const prepared = prepareRecipe(recipe, ingredients);
  const glyph = categories.find((c) => c.name === recipe.category)?.glyph ?? "*";
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const file = recipeFilename(recipe.slug);
  const repo = repoUrl();

  return (
    <article className="mx-auto max-w-2xl">
      <div className="relative mb-5 aspect-16/9 w-full overflow-hidden rounded-card">
        {recipe.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.photo}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={placeholderStyle(recipe.slug)}
            aria-hidden="true"
          >
            <span className="text-5xl font-semibold text-white/70">{glyph}</span>
          </div>
        )}
      </div>

      {recipe.photoCredit?.pageUrl ? (
        <p className="text-xs text-text-muted">
          Photo:{" "}
          <a
            href={recipe.photoCredit.pageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text"
          >
            {recipe.photoCredit.siteName ?? "source"}
          </a>
        </p>
      ) : null}

      <header className="mt-6">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
            {recipe.category}
          </span>
          {recipe.draft ? (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
              Draft — not yet cooked here
            </span>
          ) : null}
        </div>

        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{recipe.title}</h1>

        {recipe.description ? (
          <p className="mt-2 text-text-muted">{recipe.description}</p>
        ) : null}

        <SourceLine sourceUrl={recipe.source} className="mt-2" />

        {totalMinutes > 0 ? (
          <p className="numeric mt-3 text-sm text-text-muted">
            {[
              recipe.prepMinutes ? `${recipe.prepMinutes} min prep` : null,
              recipe.cookMinutes ? `${recipe.cookMinutes} min ${recipe.cookLabel}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {recipe.prepMinutes && recipe.cookMinutes
              ? ` · ${totalMinutes} min total`
              : null}
          </p>
        ) : null}

        {recipe.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <RecipeView
        baseServings={recipe.servings}
        servingLabel={recipe.servingLabel}
        scalable={prepared.scalable}
        nutrition={prepared.nutrition}
        steps={recipe.steps}
        tin={recipe.tin}
      />

      <div className="mt-4">
        <ExportLinks slug={recipe.slug} />
      </div>

      {recipe.notes ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">Notes</h2>
          <p className="text-sm whitespace-pre-line text-text-muted">{recipe.notes}</p>
        </section>
      ) : null}

      {recipe.storage ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">
            Storage and reheating
          </h2>
          <p className="text-sm whitespace-pre-line text-text-muted">{recipe.storage}</p>
        </section>
      ) : null}

      {recipe.log.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">Log</h2>
          <ul className="flex flex-col gap-2">
            {recipe.log.map((entry, index) => (
              <li key={`${entry.date}-${index}`} className="text-sm">
                {entry.date ? (
                  <span className="numeric mr-2 text-xs text-text-muted">
                    {entry.date}
                  </span>
                ) : null}
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {repo ? (
        <section className="mt-10 border-t border-border pt-4">
          <p className="text-xs text-text-muted">
            This recipe is one file.{" "}
            <a
              href={`${repo}/blob/main/${file}`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-text"
            >
              Read it
            </a>
            ,{" "}
            <a
              href={`${repo}/edit/main/${file}`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-text"
            >
              edit it
            </a>
            , or see{" "}
            <a
              href={`${repo}/commits/main/${file}`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-text"
            >
              everything it has ever been
            </a>
            .
          </p>
        </section>
      ) : null}
    </article>
  );
}

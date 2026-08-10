import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipeBySlug } from "@/lib/recipes";
import { placeholderStyle } from "@/lib/photos/placeholder";

/**
 * Recipe detail.
 *
 * Phase 2 renders the stored recipe as entered. The servings stepper (phase 4)
 * and macro panel (phase 5) attach here.
 */
export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <article className="mx-auto max-w-2xl">
      <div className="relative mb-5 aspect-16/9 w-full overflow-hidden rounded-card">
        {recipe.photoUrl ? (
          /* See recipe-card.tsx for why next/image is not used. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.photoUrl}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={placeholderStyle(recipe.slug)}
            aria-hidden="true"
          >
            <span className="text-5xl font-semibold text-white/70">
              {recipe.category.glyph}
            </span>
          </div>
        )}
      </div>

      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-xs font-medium tracking-wide text-text-muted uppercase hover:text-text"
          >
            {recipe.category.name}
          </Link>
          {recipe.status === "DRAFT" ? (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
              Draft — not yet reviewed
            </span>
          ) : null}
        </div>

        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{recipe.title}</h1>

        {recipe.description ? (
          <p className="mt-2 text-text-muted">{recipe.description}</p>
        ) : null}

        <p className="numeric mt-3 text-sm text-text-muted">
          Makes {recipe.baseServings} {recipe.servingLabel}
          {recipe.baseServings === 1 ? "" : "s"}
          {totalMinutes > 0 ? ` · ${totalMinutes} min total` : ""}
        </p>

        {recipe.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <li
                key={tag.id}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted"
              >
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex items-center gap-4 text-sm">
          <Link
            href={`/recipes/${recipe.slug}/edit`}
            className="text-accent hover:underline"
          >
            Edit
          </Link>
          {recipe.sourceUrl ? (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-text-muted hover:text-text"
            >
              Source
            </a>
          ) : null}
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
          Ingredients
        </h2>
        <ul className="flex flex-col gap-1.5">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.id} className="flex items-baseline gap-2 text-sm">
              {/* rawText, not the reconstructed parse: the line the cook wrote
                  is authoritative, and the parse exists only to drive scaling
                  and macros. */}
              <span>{ingredient.rawText}</span>
              {!ingredient.scalable ? (
                <span
                  className="text-xs text-text-muted"
                  title="Excluded from scaling — multiplying it would produce a wrong amount"
                >
                  (not scaled)
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-text-muted">No ingredients recorded.</p>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">Method</h2>
        <ol className="flex flex-col gap-3">
          {recipe.steps.map((step, index) => (
            <li key={step.id} className="flex gap-3 text-sm">
              <span className="numeric shrink-0 text-text-muted">{index + 1}</span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        {recipe.steps.length === 0 ? (
          <p className="text-sm text-text-muted">No method recorded.</p>
        ) : null}
      </section>

      {recipe.notes ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">Notes</h2>
          <p className="text-sm whitespace-pre-line text-text-muted">{recipe.notes}</p>
        </section>
      ) : null}
    </article>
  );
}

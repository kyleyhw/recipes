import { notFound } from "next/navigation";
import { MacroPanel } from "@/components/macro-panel";
import { SourceLine } from "@/components/source-line";
import { ServingsStepper } from "@/components/servings-stepper";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getRecipeBySlug } from "@/lib/recipes";
import { nutritionFor } from "@/lib/nutrition/recipe-nutrition";
import { placeholderStyle } from "@/lib/photos/placeholder";
import { scaleRecipe } from "@/lib/scaling";
import type { PhotoCredit } from "@/lib/photos/attach";

/**
 * Public read-only recipe page.
 *
 * Reachable without a session — one of the three prefixes the proxy lets
 * through. It carries the full working recipe including scaling and the macro
 * panel, because a share link that shows less than the owner sees is a worse
 * artefact than a link to a screenshot.
 *
 * What it does not carry: edit controls, the photo controls, the collection
 * navigation, or any link into the owner's other recipes.
 */
export default async function SharedRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ shareId: string }>;
  searchParams: Promise<{ servings?: string }>;
}) {
  const { shareId } = await params;
  const { servings } = await searchParams;

  const found = await db.recipe.findUnique({
    where: { shareId },
    select: { slug: true },
  });
  if (!found) notFound();

  const recipe = await getRecipeBySlug(found.slug);
  if (!recipe) notFound();

  const requested = Number.parseFloat(servings ?? "");
  const targetServings =
    Number.isFinite(requested) && requested > 0 ? requested : recipe.baseServings;

  const scaled = scaleRecipe(recipe.ingredients, recipe.baseServings, targetServings, {
    cookMinutes: recipe.cookMinutes,
  });
  const isScaled = Math.abs(scaled.factor - 1) > 1e-9;
  const nutrition = nutritionFor(recipe, targetServings);
  const credit = recipe.photoCredit as PhotoCredit | null;

  const origin = appUrl();
  const bundleUrl = `/api/public/recipes/${shareId}`;
  const shareUrl = origin ? `${origin}/r/${shareId}` : `/r/${shareId}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <article>
        <div className="relative mb-4 aspect-16/9 w-full overflow-hidden rounded-card">
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

        {credit?.pageUrl ? (
          <p className="text-xs text-text-muted">
            Photo:{" "}
            <a
              href={credit.pageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              {credit.siteName ?? "source"}
            </a>
          </p>
        ) : null}

        <header className="mt-4 mb-6">
          <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
            {recipe.category.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{recipe.title}</h1>
          {/* The original source travels with a shared recipe. A visitor is
              entitled to know where it came from as much as the owner is. */}
          <SourceLine sourceUrl={recipe.sourceUrl} className="mt-2" />
          {recipe.description ? (
            <p className="mt-2 text-text-muted">{recipe.description}</p>
          ) : null}

          <div className="mt-4">
            <ServingsStepper
              basePath={`/r/${shareId}`}
              baseServings={recipe.baseServings}
              servingLabel={recipe.servingLabel}
              current={targetServings}
            />
          </div>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
            Ingredients
          </h2>
          <ul className="flex flex-col gap-1.5">
            {scaled.ingredients.map((ingredient) => (
              <li key={ingredient.id} className="text-sm">
                <span>{isScaled ? ingredient.display : ingredient.rawText}</span>
                {ingredient.advisory ? (
                  <p className="mt-1 rounded-card bg-warn-soft px-2 py-1 text-xs text-warn">
                    {ingredient.advisory}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {scaled.advisories.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {scaled.advisories.map((advisory) => (
                <p
                  key={advisory.kind}
                  className="rounded-card bg-warn-soft px-3 py-2 text-xs text-warn"
                >
                  {advisory.text}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mb-8">
          <MacroPanel nutrition={nutrition} servingLabel={recipe.servingLabel} />
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
        </section>

        {recipe.notes ? (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">Notes</h2>
            <p className="text-sm whitespace-pre-line text-text-muted">{recipe.notes}</p>
          </section>
        ) : null}
      </article>

      {/* The instance-to-instance path. Anyone running their own copy pastes
          this link into their own import page and gets the recipe with its
          nutrition data intact. */}
      <aside className="rounded-card border border-border bg-surface p-4 text-sm">
        <h2 className="font-medium">Import this into your own collection</h2>
        <p className="mt-1 text-xs text-text-muted">
          Running your own copy of this application? Paste this link into your import page
          and the recipe arrives with its ingredient nutrition data already resolved.
        </p>
        <code className="mt-2 block overflow-x-auto rounded bg-surface-2 px-2 py-1 text-xs">
          {shareUrl}
        </code>
        <p className="mt-3 text-xs text-text-muted">
          Or download it as a{" "}
          <a href={bundleUrl} className="underline hover:text-text" download>
            portable JSON file
          </a>
          .
        </p>
      </aside>
    </div>
  );
}

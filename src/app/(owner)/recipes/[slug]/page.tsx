import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MacroPanel } from "@/components/macro-panel";
import { PhotoControls } from "@/components/photo-controls";
import { ServingsStepper } from "@/components/servings-stepper";
import { ExportLinks } from "@/components/export-links";
import { nutritionFor } from "@/lib/nutrition/recipe-nutrition";
import { shareRecipe, unshareRecipe } from "@/lib/sharing/exchange";
import { appUrl } from "@/lib/env";
import { resolveRecipeIngredients } from "@/lib/nutrition/resolve";
import { getRecipeBySlug } from "@/lib/recipes";
import { scaleRecipe } from "@/lib/scaling";
import { placeholderStyle } from "@/lib/photos/placeholder";
import { attachUploadedPhoto, clearPhoto, type PhotoCredit } from "@/lib/photos/attach";
import { INGEST_FAILURE_MESSAGES } from "@/lib/photos/ingest";

/**
 * Recipe detail.
 *
 * The serving count is read from the URL, so a scaled recipe is a shareable
 * link and the back button restores the previous size. Scaling is a view: the
 * stored recipe keeps its base servings and is never mutated by it.
 *
 * The macro panel (phase 5) attaches here.
 */
export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ photoError?: string; servings?: string }>;
}) {
  const { slug } = await params;
  const { photoError, servings } = await searchParams;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const recipeId = recipe.id;

  // An absent, malformed, or non-positive `servings` falls back to the base,
  // so a hand-edited URL cannot produce a negative scaling factor.
  const requested = Number.parseFloat(servings ?? "");
  const targetServings =
    Number.isFinite(requested) && requested > 0 ? requested : recipe.baseServings;

  const scaled = scaleRecipe(recipe.ingredients, recipe.baseServings, targetServings, {
    cookMinutes: recipe.cookMinutes,
  });
  const isScaled = Math.abs(scaled.factor - 1) > 1e-9;
  const nutrition = nutritionFor(recipe, targetServings);

  async function resolveIngredients(): Promise<void> {
    "use server";
    await resolveRecipeIngredients(recipeId);
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}`);
  }

  async function uploadPhoto(formData: FormData): Promise<void> {
    "use server";
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) redirect(`/recipes/${slug}`);

    const failure = await attachUploadedPhoto(
      recipeId,
      Buffer.from(await file.arrayBuffer()),
    );
    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    redirect(failure ? `/recipes/${slug}?photoError=${failure}` : `/recipes/${slug}`);
  }

  async function removePhoto(): Promise<void> {
    "use server";
    await clearPhoto(recipeId);
    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}`);
  }

  async function startSharing(): Promise<void> {
    "use server";
    await shareRecipe(recipeId);
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}`);
  }

  async function stopSharing(): Promise<void> {
    "use server";
    await unshareRecipe(recipeId);
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}`);
  }

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

      <PhotoControls
        photoUrl={recipe.photoUrl}
        photoSource={recipe.photoSource}
        photoCredit={recipe.photoCredit as PhotoCredit | null}
        uploadAction={uploadPhoto}
        clearAction={removePhoto}
        error={
          photoError && photoError in INGEST_FAILURE_MESSAGES
            ? INGEST_FAILURE_MESSAGES[photoError as keyof typeof INGEST_FAILURE_MESSAGES]
            : undefined
        }
      />

      <header className="mt-6 mb-6">
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
          {totalMinutes > 0 ? `${totalMinutes} min total` : null}
        </p>

        <div className="mt-4">
          <ServingsStepper
            basePath={`/recipes/${recipe.slug}`}
            baseServings={recipe.baseServings}
            servingLabel={recipe.servingLabel}
            current={targetServings}
          />
        </div>

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
          {scaled.ingredients.map((ingredient) => (
            <li key={ingredient.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                {/* At the base size the line the cook wrote is authoritative and
                    is shown verbatim. The reconstructed parse appears only once
                    scaled, which is the only case where the stored text would be
                    wrong. */}
                <span>{isScaled ? ingredient.display : ingredient.rawText}</span>
                {ingredient.passedThrough && isScaled ? (
                  <span
                    className="shrink-0 text-xs text-text-muted"
                    title="Excluded from scaling — multiplying it would produce a wrong amount"
                  >
                    (not scaled)
                  </span>
                ) : null}
              </div>
              {ingredient.advisory ? (
                <p className="mt-1 rounded-card bg-warn-soft px-2 py-1 text-xs text-warn">
                  {ingredient.advisory}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-text-muted">No ingredients recorded.</p>
        ) : null}

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
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ExportLinks slug={recipe.slug} servings={targetServings} />
          {nutrition.contributions.some((c) => c.gap === "unresolved") ? (
            <form action={resolveIngredients}>
              <button type="submit" className="text-xs text-accent hover:underline">
                Match unresolved ingredients
              </button>
            </form>
          ) : null}
        </div>
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

      <section className="mb-8 rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Sharing</h2>
        {recipe.shareId ? (
          <>
            <p className="mt-2 text-xs text-text-muted">
              Anyone with this link can read the recipe without signing in. It carries the
              ingredient nutrition data, so another instance can import it directly.
            </p>
            <code className="mt-2 block overflow-x-auto rounded bg-surface-2 px-2 py-1 text-xs">
              {appUrl() ? `${appUrl()}/r/${recipe.shareId}` : `/r/${recipe.shareId}`}
            </code>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
              <a
                href={`/r/${recipe.shareId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent hover:underline"
              >
                Open the public page
              </a>
              <a
                href={`/api/public/recipes/${recipe.shareId}`}
                download
                className="text-accent hover:underline"
              >
                Download as a file
              </a>
              <form action={stopSharing}>
                <button type="submit" className="text-danger hover:underline">
                  Stop sharing
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs text-text-muted">
              Not shared. Sharing mints an unguessable link that works without a sign-in;
              revoking it invalidates the link immediately.
            </p>
            <form action={startSharing} className="mt-3">
              <button type="submit" className="text-xs text-accent hover:underline">
                Create a share link
              </button>
            </form>
          </>
        )}
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

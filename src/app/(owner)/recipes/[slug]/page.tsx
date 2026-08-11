import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MacroPanel } from "@/components/macro-panel";
import { PhotoControls } from "@/components/photo-controls";
import { ServingsStepper } from "@/components/servings-stepper";
import { ExportLinks } from "@/components/export-links";
import { nutritionFor } from "@/lib/nutrition/recipe-nutrition";
import { shareRecipe, unshareRecipe } from "@/lib/sharing/exchange";
import { appUrl, features } from "@/lib/env";
import { sourcePhotoByWebSearch } from "@/lib/ai/photo";
import { reviseFromMessage } from "@/lib/ai/revise";
import { RecipeLog } from "@/components/recipe-log";
import { SourceLine } from "@/components/source-line";
import {
  addEntry,
  countEntries,
  countRevisions,
  deleteEntry,
  listEntries,
} from "@/lib/journal";
import { resolveRecipeIngredients } from "@/lib/nutrition/resolve";
import { getRecipeBySlug } from "@/lib/recipes";
import { scaleRecipe } from "@/lib/scaling";
import { placeholderStyle } from "@/lib/photos/placeholder";
import { attachUploadedPhoto, clearPhoto, type PhotoCredit } from "@/lib/photos/attach";
import { INGEST_FAILURE_MESSAGES } from "@/lib/photos/ingest";

/**
 * Turns the `photoError` query parameter into a sentence.
 *
 * The parameter carries three kinds of value: an ingest failure code, the
 * literal `search-empty`, and — for a failed Claude call — the failure message
 * itself, which is already written for a reader. Passing the last through
 * unchanged is what lets "the monthly ceiling has been reached" reach the
 * owner instead of a generic "photo failed".
 */
function photoErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code in INGEST_FAILURE_MESSAGES) {
    return INGEST_FAILURE_MESSAGES[code as keyof typeof INGEST_FAILURE_MESSAGES];
  }
  if (code === "search-empty") {
    return "Claude found no photograph of this dish that was usable. Upload one, or try again later.";
  }
  return code;
}

/**
 * Recipe detail.
 *
 * The serving count is read from the URL, so a scaled recipe is a shareable
 * link and the back button restores the previous size. Scaling is a view: the
 * stored recipe keeps its base servings and is never mutated by it.
 *
 * The notes-and-chat log is the same idea: `?chat=1` rather than client state.
 * It is closed by default and reached from one quiet line, because the recipe
 * is what this page is for. Open, it becomes a second column on a wide screen
 * and follows the recipe on a narrow one — one layout, expressed in the grid,
 * with no client component and no duplicated markup.
 */
export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    photoError?: string;
    servings?: string;
    chat?: string;
    logError?: string;
  }>;
}) {
  const { slug } = await params;
  const { photoError, servings, chat, logError } = await searchParams;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  // Captured as values rather than read off `recipe` inside the Server Actions
  // below: those are function declarations, which are hoisted above the
  // not-found narrowing, so `recipe` is nullable from inside them.
  const recipeId = recipe.id;
  const recipeTitle = recipe.title;
  const recipeDescription = recipe.description;

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

  // The log is only read when it is open. Closed, the page needs the counts and
  // nothing else, and a recipe page should not pay for a panel nobody opened.
  const logOpen = chat === "1";
  const [entries, revisionCount] = await Promise.all([
    logOpen ? listEntries(recipe.id) : Promise.resolve([]),
    countRevisions(recipe.id),
  ]);
  const entryCount = logOpen ? entries.length : await countEntries(recipe.id);

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

  /**
   * Photo layer 2, on demand.
   *
   * Offered as an explicit action rather than run automatically on every
   * recipe, because it is the only billable operation the recipe page can
   * perform and the owner should be the one who decides to spend it.
   */
  async function findPhoto(): Promise<void> {
    "use server";
    const result = await sourcePhotoByWebSearch(recipeId, {
      title: recipeTitle,
      description: recipeDescription,
      query: null,
    });
    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    // A search that found nothing usable and a search that could not run are
    // different failures, and the message distinguishes them.
    redirect(
      result.ok
        ? result.attached
          ? `/recipes/${slug}`
          : `/recipes/${slug}?photoError=search-empty`
        : `/recipes/${slug}?photoError=${encodeURIComponent(result.message)}`,
    );
  }

  async function removePhoto(): Promise<void> {
    "use server";
    await clearPhoto(recipeId);
    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}`);
  }

  /** Records a note. No model call, no cost. */
  async function addNote(formData: FormData): Promise<void> {
    "use server";
    await addEntry(recipeId, "NOTE", String(formData.get("text") ?? ""));
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}?chat=1#log`);
  }

  /**
   * Sends the message to Claude, which changes the recipe if it should.
   *
   * The message is written to the log before the call, so a failure still
   * leaves the cook's own words recorded — those are the part that cannot be
   * reconstructed.
   */
  async function askClaude(formData: FormData): Promise<void> {
    "use server";
    const text = String(formData.get("text") ?? "").trim();
    if (text.length === 0) redirect(`/recipes/${slug}?chat=1#log`);

    const current = await getRecipeBySlug(slug);
    if (!current) notFound();

    const result = await reviseFromMessage(current, text);
    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    redirect(
      result.ok
        ? `/recipes/${slug}?chat=1#log`
        : `/recipes/${slug}?chat=1&logError=${encodeURIComponent(result.message)}#log`,
    );
  }

  async function removeEntry(formData: FormData): Promise<void> {
    "use server";
    await deleteEntry(recipeId, String(formData.get("entryId") ?? ""));
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}?chat=1#log`);
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
    // Closed, the recipe is a single centred column at a comfortable measure.
    // Open, the log takes a fixed second column beside it on a wide screen and
    // falls below it on a narrow one. One grid, no duplicated markup, and the
    // recipe keeps the same measure either way rather than stretching to fill
    // the space the panel vacated.
    <div
      className={
        logOpen
          ? "mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
          : "mx-auto max-w-2xl"
      }
    >
      <article className="min-w-0">
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
          {...(features.ai ? { findAction: findPhoto } : {})}
          error={photoErrorMessage(photoError)}
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

          {/* Where it came from, stated rather than hidden behind a word. */}
          <SourceLine sourceUrl={recipe.sourceUrl} className="mt-2" />

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
            {features.ai ? (
              <Link
                href={`/recipes/${recipe.slug}/substitute`}
                className="text-accent hover:underline"
              >
                Substitute
              </Link>
            ) : null}
            {/* The log's entire presence on a closed page: one line. The count is
              what makes it worth opening, so it is the only decoration. */}
            {logOpen ? null : (
              <Link
                href={`/recipes/${recipe.slug}?chat=1#log`}
                className="text-text-muted hover:text-text"
              >
                {/* The explicit space matters: JSX drops the newline between a
                  text node and an expression, so without it this renders as
                  "Notes(1)". */}
                Notes{" "}
                {entryCount > 0 ? <span className="numeric">({entryCount})</span> : null}
              </Link>
            )}
            {revisionCount > 0 ? (
              <Link
                href={`/recipes/${recipe.slug}/history`}
                className="text-text-muted hover:text-text"
              >
                History
              </Link>
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
                Anyone with this link can read the recipe without signing in. It carries
                the ingredient nutrition data, so another instance can import it directly.
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
                Not shared. Sharing mints an unguessable link that works without a
                sign-in; revoking it invalidates the link immediately.
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
            <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">
              Recipe notes
            </h2>
            <p className="text-sm whitespace-pre-line text-text-muted">{recipe.notes}</p>
          </section>
        ) : null}
      </article>

      {logOpen ? (
        <aside className="min-w-0">
          <RecipeLog
            slug={recipe.slug}
            entries={entries}
            revisionCount={revisionCount}
            aiEnabled={features.ai}
            noteAction={addNote}
            askAction={askClaude}
            deleteAction={removeEntry}
            error={logError}
          />
        </aside>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AiBudgetNote } from "@/components/ai-budget-note";
import { proposeSubstitution } from "@/lib/ai/substitute";
import { features } from "@/lib/env";
import { recordRevision, snapshotOf } from "@/lib/journal";
import { getRecipeBySlug, tagsToText, updateRecipe } from "@/lib/recipes";

/**
 * Adjusting a recipe for a missing ingredient.
 *
 * The request lives in the URL, like search does, so a proposal is a link: it
 * can be bookmarked, sent to the other half of the household, and restored by
 * the back button. The cost of that choice is that reloading the page asks
 * again, and asking again is billable — which is why the page says so rather
 * than leaving it to be discovered on the invoice.
 *
 * Nothing is applied automatically. The proposal is rendered as a diff, the
 * result is editable before it is saved, and an edit whose original line could
 * not be found is listed explicitly instead of being applied somewhere
 * plausible.
 */
export default async function SubstitutePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ need?: string }>;
}) {
  if (!features.ai) redirect("/");

  const { slug } = await params;
  const { need } = await searchParams;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const request = need?.trim() ?? "";
  const proposal = request.length > 0 ? await proposeSubstitution(recipe, request) : null;
  const recipeId = recipe.id;

  async function apply(formData: FormData): Promise<void> {
    "use server";
    const current = await getRecipeBySlug(slug);
    if (!current) notFound();

    await updateRecipe(recipeId, {
      title: current.title,
      description: current.description,
      categoryId: current.categoryId,
      baseServings: current.baseServings,
      servingLabel: current.servingLabel,
      prepMinutes: current.prepMinutes,
      cookMinutes: current.cookMinutes,
      sourceUrl: current.sourceUrl,
      notes: current.notes,
      // The substituted recipe is a draft of the original, not the original:
      // it has not been cooked in this form. Reviewing it is one click in the
      // editor, and that click is the point.
      status: "DRAFT",
      ingredientsText: String(formData.get("ingredientsText") ?? ""),
      stepsText: String(formData.get("stepsText") ?? ""),
      tagsText: tagsToText(current),
    });

    // Recorded like any other change, so a substitution is as recoverable as a
    // note-driven one and shows up in the same history.
    await recordRevision(recipeId, "EDIT", `Substituted: ${request}`, {
      baseline: snapshotOf(current),
    });

    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    redirect(`/recipes/${slug}`);
  }

  const inputClass =
    "w-full rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/recipes/${recipe.slug}`}
        className="text-xs text-text-muted hover:text-text"
      >
        ← {recipe.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Substitute</h1>

      <form
        action={`/recipes/${recipe.slug}/substitute`}
        method="get"
        className="mt-6 flex flex-col gap-2"
      >
        <label htmlFor="need" className="text-sm font-medium">
          What are you missing, or what do you want changed?
        </label>
        <div className="flex gap-2">
          <input
            id="need"
            name="need"
            defaultValue={request}
            placeholder="no buttermilk; make it dairy-free"
            className={inputClass}
          />
          <button
            type="submit"
            className="shrink-0 rounded-card bg-accent px-4 py-2 font-medium text-white"
          >
            Ask
          </button>
        </div>
        <AiBudgetNote />
      </form>

      {proposal && !proposal.ok ? (
        <p
          className="mt-6 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn"
          role="alert"
        >
          {proposal.message}
        </p>
      ) : null}

      {proposal?.ok ? (
        <section className="mt-8">
          {!proposal.data.substitution.feasible ? (
            <p className="rounded-card bg-warn-soft px-3 py-2 text-sm text-warn">
              Claude does not think this substitution is worth making.
            </p>
          ) : null}

          <p className="text-sm">{proposal.data.substitution.summary}</p>

          {proposal.data.substitution.replacements.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {proposal.data.substitution.replacements.map((replacement) => (
                <li
                  key={replacement.originalRawText}
                  className="rounded-card border border-border bg-surface p-3 text-sm"
                >
                  <p className="text-text-muted line-through">
                    {replacement.originalRawText}
                  </p>
                  <p className="font-medium">{replacement.replacementRawText}</p>
                  <p className="numeric mt-1 text-xs text-text-muted">
                    {replacement.ratio}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">{replacement.effect}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {proposal.data.substitution.stepEdits.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {proposal.data.substitution.stepEdits.map((edit) => (
                <li
                  key={edit.originalText}
                  className="rounded-card border border-border bg-surface p-3 text-sm"
                >
                  <p className="text-text-muted line-through">{edit.originalText}</p>
                  <p>{edit.replacementText}</p>
                  <p className="mt-1 text-xs text-text-muted">{edit.reason}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {proposal.data.unmatched.length > 0 ? (
            <div className="mt-4 rounded-card bg-warn-soft px-3 py-2 text-xs text-warn">
              <p className="font-medium">
                These edits named lines that are not in the recipe, so they have not been
                applied:
              </p>
              <ul className="mt-1 list-disc pl-4">
                {proposal.data.unmatched.map((edit) => (
                  <li key={edit.from}>
                    {edit.from} → {edit.to}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form action={apply} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="ingredientsText" className="text-sm font-medium">
                Ingredients after the swap
              </label>
              <textarea
                id="ingredientsText"
                name="ingredientsText"
                rows={Math.max(4, proposal.data.ingredientsText.split("\n").length)}
                defaultValue={proposal.data.ingredientsText}
                className={`${inputClass} font-mono text-sm`}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="stepsText" className="text-sm font-medium">
                Method after the swap
              </label>
              <textarea
                id="stepsText"
                name="stepsText"
                rows={Math.max(4, proposal.data.stepsText.split("\n").length)}
                defaultValue={proposal.data.stepsText}
                className={`${inputClass} font-mono text-sm`}
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                type="submit"
                className="rounded-card bg-accent px-4 py-2 font-medium text-white"
              >
                Apply to the recipe
              </button>
              <Link
                href={`/recipes/${recipe.slug}`}
                className="text-sm text-text-muted hover:text-text"
              >
                Discard
              </Link>
            </div>
            <p className="text-xs text-text-muted">
              Applying replaces the recipe&rsquo;s ingredients and method, and marks it a
              draft until you review it. Edit the text above first if you want something
              different.
            </p>
          </form>
        </section>
      ) : null}
    </div>
  );
}

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AiBudgetNote } from "@/components/ai-budget-note";
import { generateRecipe } from "@/lib/ai/generate";
import { saveDraft } from "@/lib/ai/drafts";
import { sourcePhotoByWebSearch } from "@/lib/ai/photo";
import { features } from "@/lib/env";

/**
 * Writing a new recipe with Claude.
 *
 * Three ways of asking are offered on one form because they are the three ways
 * the question arises: from what is in the fridge, from a dish in mind, or from
 * a nutritional target. Any combination is allowed — "something with these
 * aubergines, around 600 kcal" is a perfectly ordinary request — so they are
 * fields rather than a mode selector.
 *
 * The result is saved as a `DRAFT` and opened for review. It is not a recipe
 * this kitchen has cooked, and the collection distinguishes the two.
 *
 * The photograph is sourced in the same request rather than in the background.
 * A background job would need a queue, and this deployment has no worker; more
 * to the point, arriving at a finished recipe with a picture already on it is
 * the difference between something that feels made and something that feels
 * pending.
 */
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!features.ai) redirect("/");
  const { error } = await searchParams;

  async function generate(formData: FormData): Promise<void> {
    "use server";
    const brief = String(formData.get("brief") ?? "").trim();
    const onHand = String(formData.get("onHand") ?? "").trim();
    const servingsRaw = Number.parseFloat(String(formData.get("servings") ?? ""));
    const kcalRaw = Number.parseFloat(String(formData.get("targetKcal") ?? ""));

    if (brief.length === 0 && onHand.length === 0) {
      redirect("/generate?error=empty");
    }

    const result = await generateRecipe({
      brief,
      onHand,
      targetKcal: Number.isFinite(kcalRaw) && kcalRaw > 0 ? kcalRaw : null,
      servings: Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : 4,
    });

    if (!result.ok) {
      redirect(`/generate?error=${encodeURIComponent(result.message)}`);
    }

    const saved = await saveDraft(result.data);

    // A failure here costs the photograph, not the recipe: the deterministic
    // placeholder renders in its place and the photo can be found again later
    // from the recipe page.
    await sourcePhotoByWebSearch(saved.id, {
      title: result.data.title,
      description: result.data.description,
      query: result.data.photoQuery,
    });

    revalidatePath("/");
    redirect(`/recipes/${saved.slug}`);
  }

  const inputClass =
    "w-full rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Write a recipe</h1>
      <p className="mt-1 text-sm text-text-muted">
        Saved as a draft and opened for review. Your memories are applied.
      </p>

      {error ? (
        <p
          className="mt-4 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn"
          role="alert"
        >
          {error === "empty"
            ? "Say what you want, or list what you have."
            : decodeURIComponent(error)}
        </p>
      ) : null}

      <form action={generate} className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="brief" className="text-sm font-medium">
            What do you want?
          </label>
          <textarea
            id="brief"
            name="brief"
            rows={3}
            placeholder="A hot, sharp noodle soup for a cold evening"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="onHand" className="text-sm font-medium">
            What have you got?
          </label>
          <p className="text-xs text-text-muted">
            The recipe is built around these. Salt, pepper, oil, and water are assumed;
            anything else it adds is named in the notes.
          </p>
          <textarea
            id="onHand"
            name="onHand"
            rows={3}
            placeholder="two aubergines, half a block of feta, a lemon"
            className={inputClass}
          />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="servings" className="text-sm font-medium">
              Servings
            </label>
            <input
              id="servings"
              name="servings"
              type="number"
              min="1"
              step="1"
              defaultValue="4"
              className={inputClass}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="targetKcal" className="text-sm font-medium">
              kcal per serving
            </label>
            <input
              id="targetKcal"
              name="targetKcal"
              type="number"
              min="1"
              step="10"
              placeholder="optional"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="self-start rounded-card bg-accent px-4 py-2 font-medium text-white"
          >
            Write it
          </button>
          <p className="text-xs text-text-muted">
            This takes up to a minute: the recipe is written, its ingredients are matched
            for macros, and a photograph is found.
          </p>
          <AiBudgetNote />
        </div>
      </form>
    </div>
  );
}

import type { RecipeStatus } from "@/generated/prisma";

/**
 * Recipe editor, shared by the create and edit pages.
 *
 * Ingredients and steps are edited as plain textareas, one item per line,
 * rather than as a row-per-ingredient widget. That is a deliberate choice:
 * typing or pasting a list is the fastest possible entry path, it survives
 * copy-and-paste from any source, and it needs no client-side JavaScript at
 * all. The parse is shown back on the recipe page, where an error is visible
 * and correctable, and `rawText` is retained regardless.
 *
 * The whole form is a Server Action target, so it works with JavaScript
 * disabled and holds no client state.
 */
export interface RecipeFormValues {
  title: string;
  description: string;
  categoryId: string;
  baseServings: number;
  servingLabel: string;
  prepMinutes: string;
  cookMinutes: string;
  sourceUrl: string;
  notes: string;
  status: RecipeStatus;
  ingredientsText: string;
  stepsText: string;
  tagsText: string;
}

const inputClass =
  "w-full rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent";
const labelClass = "text-sm font-medium";

export function RecipeForm({
  action,
  categories,
  values,
  submitLabel,
  secondaryAction,
}: {
  action: (formData: FormData) => Promise<void>;
  categories: ReadonlyArray<{ id: string; name: string }>;
  values: RecipeFormValues;
  submitLabel: string;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={values.title}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <input
          id="description"
          name="description"
          defaultValue={values.description}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoryId" className={labelClass}>
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={values.categoryId}
            className={inputClass}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="baseServings" className={labelClass}>
            Makes
          </label>
          <input
            id="baseServings"
            name="baseServings"
            type="number"
            min="0.25"
            step="0.25"
            required
            defaultValue={values.baseServings}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="servingLabel" className={labelClass}>
            Unit
          </label>
          {/* "4 servings" is wrong for a batch of cookies. */}
          <input
            id="servingLabel"
            name="servingLabel"
            defaultValue={values.servingLabel}
            placeholder="serving"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={values.status}
            className={inputClass}
          >
            <option value="SAVED">Saved</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="prepMinutes" className={labelClass}>
            Prep (minutes)
          </label>
          <input
            id="prepMinutes"
            name="prepMinutes"
            type="number"
            min="0"
            defaultValue={values.prepMinutes}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cookMinutes" className={labelClass}>
            Cook (minutes)
          </label>
          <input
            id="cookMinutes"
            name="cookMinutes"
            type="number"
            min="0"
            defaultValue={values.cookMinutes}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ingredientsText" className={labelClass}>
          Ingredients
        </label>
        <p className="text-xs text-text-muted">
          One per line, as you would write them: <code>1 1/2 cups flour, sifted</code>.
          Quantities, units and notes are parsed automatically; the line you typed is
          always kept. Lines like <code>salt to taste</code> are excluded from scaling.
        </p>
        <textarea
          id="ingredientsText"
          name="ingredientsText"
          rows={10}
          defaultValue={values.ingredientsText}
          className={`${inputClass} font-mono text-sm`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="stepsText" className={labelClass}>
          Method
        </label>
        <p className="text-xs text-text-muted">
          One step per line. Leading numbering is stripped.
        </p>
        <textarea
          id="stepsText"
          name="stepsText"
          rows={10}
          defaultValue={values.stepsText}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tagsText" className={labelClass}>
            Tags
          </label>
          <input
            id="tagsText"
            name="tagsText"
            defaultValue={values.tagsText}
            placeholder="quick, freezes well"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sourceUrl" className={labelClass}>
            Source URL
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            defaultValue={values.sourceUrl}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={values.notes}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-card bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90"
        >
          {submitLabel}
        </button>
        {secondaryAction}
      </div>
    </form>
  );
}

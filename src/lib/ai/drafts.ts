import "server-only";
import { db } from "@/lib/db";
import type { RecipeDraft } from "@/lib/ai/schemas";
import { createRecipe, slugify } from "@/lib/recipes";
import { resolveRecipeIngredients } from "@/lib/nutrition/resolve";

/**
 * Writing a model-produced recipe into the collection.
 *
 * Shared by generation and by extraction, because the two produce the same
 * object and differ only in where it came from.
 *
 * Two decisions are fixed here rather than left to the caller:
 *
 * **Always `DRAFT`.** A recipe Claude wrote has not been cooked in this
 * kitchen. The status is what keeps the collection's trusted recipes
 * distinguishable from its proposals, and a generated recipe that saved as
 * `SAVED` would erase that distinction the moment it was convenient.
 *
 * **Ingredients are re-parsed, not trusted.** The draft carries free-text
 * ingredient lines, which go through the same parser as a hand-typed recipe.
 * That is the point: one parser, one set of quantity/unit/name conventions, one
 * nutrition pipeline calibrated against them.
 */

export interface SavedDraft {
  id: string;
  slug: string;
  /** Ingredients matched to a canonical entry, of the total parsed. */
  resolved: number;
  total: number;
}

/**
 * Finds or creates a category by name.
 *
 * Created rather than collapsed into a default, for the same reason bundle
 * import creates one: the name the model chose is information, and replacing it
 * with "Mains" silently loses it. `position: 999` puts a newly invented
 * category after the seeded ones on the browse page.
 */
async function categoryIdForName(name: string): Promise<string> {
  const category = await db.category.upsert({
    where: { slug: slugify(name) },
    update: {},
    create: { name, slug: slugify(name), position: 999 },
    select: { id: true },
  });
  return category.id;
}

export async function saveDraft(
  draft: RecipeDraft,
  options: { sourceUrl?: string | null } = {},
): Promise<SavedDraft> {
  const categoryId = await categoryIdForName(draft.categoryName);

  const slug = await createRecipe({
    title: draft.title,
    description: draft.description,
    categoryId,
    // A non-positive serving count would make the scaling factor undefined.
    // The schema asks for a positive number; this is the guard for when the
    // answer is nonetheless zero or negative.
    baseServings: draft.baseServings > 0 ? draft.baseServings : 4,
    servingLabel: draft.servingLabel || "serving",
    prepMinutes: roundMinutes(draft.prepMinutes),
    cookMinutes: roundMinutes(draft.cookMinutes),
    sourceUrl: options.sourceUrl ?? null,
    notes: draft.notes,
    status: "DRAFT",
    ingredientsText: draft.ingredients.join("\n"),
    stepsText: draft.steps.join("\n"),
    tagsText: draft.tagNames.join(", "),
  });

  const recipe = await db.recipe.findUniqueOrThrow({
    where: { slug },
    select: { id: true, _count: { select: { ingredients: true } } },
  });

  // Resolution is attempted immediately so the macro panel is populated when
  // the owner first opens the draft. It is best-effort: an unresolved
  // ingredient is a reported coverage gap, not a failure to save.
  const resolved = await resolveRecipeIngredients(recipe.id);

  return {
    id: recipe.id,
    slug,
    resolved,
    total: recipe._count.ingredients,
  };
}

/** Minutes are stored as integers; a model may answer 12.5. */
function roundMinutes(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

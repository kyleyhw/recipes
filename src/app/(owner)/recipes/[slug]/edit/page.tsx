import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { RecipeForm } from "@/components/recipe-form";
import { db } from "@/lib/db";
import { readRecipeInput } from "@/lib/form";
import {
  deleteRecipe,
  getRecipeBySlug,
  ingredientsToText,
  stepsToText,
  tagsToText,
  updateRecipe,
} from "@/lib/recipes";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [recipe, categories] = await Promise.all([
    getRecipeBySlug(slug),
    db.category.findMany({
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!recipe) notFound();

  const recipeId = recipe.id;

  async function save(formData: FormData): Promise<void> {
    "use server";
    const nextSlug = await updateRecipe(recipeId, readRecipeInput(formData));
    revalidatePath("/");
    revalidatePath(`/recipes/${nextSlug}`);
    redirect(`/recipes/${nextSlug}`);
  }

  async function remove(): Promise<void> {
    "use server";
    await deleteRecipe(recipeId);
    revalidatePath("/");
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Edit “{recipe.title}”</h1>
      <RecipeForm
        action={save}
        categories={categories}
        submitLabel="Save changes"
        secondaryAction={
          <Link
            href={`/recipes/${recipe.slug}`}
            className="text-sm text-text-muted hover:text-text"
          >
            Cancel
          </Link>
        }
        values={{
          title: recipe.title,
          description: recipe.description ?? "",
          categoryId: recipe.categoryId,
          baseServings: recipe.baseServings,
          servingLabel: recipe.servingLabel,
          prepMinutes: recipe.prepMinutes?.toString() ?? "",
          cookMinutes: recipe.cookMinutes?.toString() ?? "",
          sourceUrl: recipe.sourceUrl ?? "",
          notes: recipe.notes ?? "",
          status: recipe.status,
          ingredientsText: ingredientsToText(recipe),
          stepsText: stepsToText(recipe),
          tagsText: tagsToText(recipe),
        }}
      />

      <form action={remove} className="mt-10 border-t border-border pt-6">
        <button type="submit" className="text-sm text-danger hover:underline">
          Delete this recipe
        </button>
        <p className="mt-1 text-xs text-text-muted">
          Permanent. Export the recipe first if you might want it back.
        </p>
      </form>
    </div>
  );
}

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { RecipeForm } from "@/components/recipe-form";
import { db } from "@/lib/db";
import { readRecipeInput } from "@/lib/form";
import { createRecipe } from "@/lib/recipes";

export default async function NewRecipePage() {
  const categories = await db.category.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });

  async function create(formData: FormData): Promise<void> {
    "use server";
    const slug = await createRecipe(readRecipeInput(formData));
    // The browse page is a Server Component reading the database; without this
    // the new recipe would not appear until the route cache expired.
    revalidatePath("/");
    redirect(`/recipes/${slug}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">New recipe</h1>
      <RecipeForm
        action={create}
        categories={categories}
        submitLabel="Create recipe"
        values={{
          title: "",
          description: "",
          categoryId: categories[0]?.id ?? "",
          baseServings: 4,
          servingLabel: "serving",
          prepMinutes: "",
          cookMinutes: "",
          sourceUrl: "",
          notes: "",
          status: "SAVED",
          ingredientsText: "",
          stepsText: "",
          tagsText: "",
        }}
      />
    </div>
  );
}

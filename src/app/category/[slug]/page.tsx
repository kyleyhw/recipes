import { notFound } from "next/navigation";
import { Browse } from "@/components/browse";
import { loadCollection } from "@/lib/content/library";
import { summarise } from "@/lib/content/summary";

/**
 * One category's shelf, as a page of its own.
 *
 * The navigation is built from these, so each one has to be a real URL: a
 * category you can send someone, bookmark, and open without JavaScript. A
 * client-side filter on the home page would have looked the same and been none
 * of those things.
 *
 * Only categories that hold recipes are generated. An empty one is not a place
 * to go, and a page saying "nothing here" is worse than a link that was never
 * offered.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  const { recipes, categories } = loadCollection();
  const used = new Set(recipes.map((recipe) => recipe.category));
  return categories
    .filter((category) => used.has(category.name))
    .map((category) => ({ slug: category.slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { recipes, categories, ingredients } = loadCollection();
  const category = categories.find((entry) => entry.slug === slug);
  if (!category) notFound();

  const summaries = recipes
    .filter((recipe) => recipe.category === category.name)
    .map((recipe) => summarise(recipe, ingredients));

  return (
    <Browse
      recipes={summaries}
      categoryOrder={categories.map((c) => c.name)}
      glyphs={Object.fromEntries(categories.map((c) => [c.name, c.glyph]))}
      heading={category.name}
    />
  );
}

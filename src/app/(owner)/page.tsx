import { db } from "@/lib/db";

/**
 * Browse page.
 *
 * Phase 1 renders the seeded category list and a recipe count, which is enough
 * to confirm that the deployment, the migration, and the seed all completed.
 * Phase 2 replaces the body with category shelves and search.
 */
export default async function BrowsePage() {
  const [categories, recipeCount] = await Promise.all([
    db.category.findMany({
      orderBy: { position: "asc" },
      include: { _count: { select: { recipes: true } } },
    }),
    db.recipe.count(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Collection</h1>
      <p className="mt-1 text-sm text-text-muted">
        {recipeCount === 0
          ? "No recipes yet."
          : `${recipeCount} recipe${recipeCount === 1 ? "" : "s"}.`}
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <div className="rounded-card border border-border bg-surface px-4 py-3">
              <span className="text-sm font-medium">{category.name}</span>
              <span className="numeric ml-2 text-sm text-text-muted">
                {category._count.recipes}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

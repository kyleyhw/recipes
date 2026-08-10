import Link from "next/link";
import type { RecipeCard as RecipeCardData } from "@/lib/recipes";
import { placeholderStyle } from "@/lib/photos/placeholder";

/**
 * A recipe in a listing.
 *
 * The image area always renders something: either the stored photo or the
 * deterministic placeholder. A card with an empty image slot collapses the grid
 * rhythm, so the placeholder is a layout guarantee as much as a visual one.
 */
export function RecipeCard({ recipe }: { recipe: RecipeCardData }) {
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <Link
      href={`/recipes/${recipe.slug}`}
      className="group block overflow-hidden rounded-card border border-border bg-surface transition-colors hover:border-accent"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden">
        {recipe.photoUrl ? (
          /* Photos come from arbitrary external origins and are resized at
             ingest; next/image's loader would need every host allow-listed in
             advance, which is impossible for user-imported recipes. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={placeholderStyle(recipe.slug)}
            aria-hidden="true"
          >
            <span className="text-3xl font-semibold text-white/70">
              {recipe.category.glyph}
            </span>
          </div>
        )}
        {recipe.status === "DRAFT" ? (
          <span className="absolute top-2 left-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
            Draft
          </span>
        ) : null}
      </div>

      <div className="p-3">
        <h3 className="text-sm leading-snug font-medium">{recipe.title}</h3>
        <p className="numeric mt-1 text-xs text-text-muted">
          {recipe.baseServings} {recipe.servingLabel}
          {recipe.baseServings === 1 ? "" : "s"}
          {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}
        </p>
      </div>
    </Link>
  );
}

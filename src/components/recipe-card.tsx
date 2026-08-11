import Link from "next/link";
import type { RecipeFile } from "@/lib/content/format";
import { placeholderStyle } from "@/lib/photos/placeholder";

/**
 * A recipe in a listing.
 *
 * The image area always renders something: either the recipe's photo or the
 * deterministic placeholder keyed on its slug. A card with an empty image slot
 * collapses the grid rhythm, so the placeholder is a layout guarantee as much
 * as a visual one — and on a static site with no image service behind it, it is
 * also the only thing that costs nothing.
 */
export function RecipeCard({ recipe, glyph }: { recipe: RecipeFile; glyph: string }) {
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <Link
      href={`/recipes/${recipe.slug}`}
      className="group block overflow-hidden rounded-card border border-border bg-surface transition-colors hover:border-accent"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden">
        {recipe.photo ? (
          /* next/image is not used: a static export has no image optimiser, so
             it would add markup and a loader for no benefit. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.photo}
            alt={recipe.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={placeholderStyle(recipe.slug)}
            aria-hidden="true"
          >
            <span className="text-3xl font-semibold text-white/70">{glyph}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm leading-snug font-medium">{recipe.title}</h3>
        <p className="numeric mt-1 text-xs text-text-muted">
          {totalMinutes > 0 ? `${totalMinutes} min` : null}
          {recipe.draft ? (
            <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-warn">
              draft
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

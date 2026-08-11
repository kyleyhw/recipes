"use client";

import Link from "next/link";
import { TContent, useLanguage, useT } from "@/components/language";
import type { RecipeSummary } from "@/lib/content/summary";
import { decimal } from "@/lib/format";
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
export function RecipeCard({
  recipe,
  glyph,
  showProtein = false,
}: {
  recipe: RecipeSummary;
  glyph: string;
  /**
   * Shown when the listing is ranked by protein. Ranking by a number the reader
   * cannot see is a ranking they have to take on trust.
   */
  showProtein?: boolean;
}) {
  const t = useT();
  const language = useLanguage();
  // Prep and cook shown separately rather than summed: they answer different
  // questions. "Can I start this now?" is prep; a cook can add two numbers for
  // the total. A single figure hides which of the two a 90-minute recipe is.
  const times = [
    recipe.prepMinutes ? t("minPrep", { n: recipe.prepMinutes }) : null,
    recipe.cookMinutes
      ? t("minCook", {
          n: recipe.cookMinutes,
          label: recipe.cookLabels[language] ?? recipe.cookLabel,
        })
      : null,
  ].filter(Boolean);

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
        <h3 className="text-sm leading-snug font-medium">
          <TContent en={recipe.title} translated={recipe.titles} />
        </h3>
        <p className="numeric mt-1 text-xs text-text-muted">
          {times.join(" · ")}
          {recipe.draft ? (
            <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-warn">
              {t("draft")}
            </span>
          ) : null}
        </p>
        {showProtein ? (
          <p className="numeric mt-1 text-xs text-accent">
            {recipe.proteinPerServing === null
              ? t("proteinUnknown")
              : t("proteinPerServing", { n: decimal(recipe.proteinPerServing, 1) })}
            {/* Coverage qualifies the figure rather than hiding it: a number
                derived from a fifth of the recipe's mass is not the same claim
                as one derived from all of it. */}
            {recipe.proteinPerServing !== null && recipe.coverage < 0.9 ? (
              <span className="text-text-muted">
                {" "}
                {t("pctCovered", { n: Math.round(recipe.coverage * 100) })}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

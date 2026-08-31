import { Fragment } from "react";
import Link from "next/link";
import { loadCollection } from "@/lib/content/library";
import { usedInIndex } from "@/lib/content/prepare";
import { UsedIn } from "@/components/ingredient-library";
import { decimal, decimalOrDash } from "@/lib/format";

/**
 * The canonical ingredient library.
 *
 * Every macro figure on the site comes from this table, so it is shown in full
 * rather than hidden: a number a cook cannot trace is a number they cannot
 * trust. `sourceNote` is displayed for the same reason it was required as a
 * column — a suspicious figure must be checkable against where it came from.
 *
 * It is one file, `content/ingredients.json`, so correcting a figure is a
 * commit and a wrong one shows up in a diff.
 *
 * This is the unfolded view, and the drawer is the other half of the pair. In
 * the drawer every note is a `<details>`, because a list of two hundred rows
 * scrolled past with every source note open cannot be scanned. Here nothing is
 * folded, because the page exists to be read against the numbers rather than
 * scrolled past, and a figure whose provenance takes a click is a figure fewer
 * people check.
 */
export default function IngredientsPage() {
  const { recipes, ingredients } = loadCollection();
  const usedIn = usedInIndex(recipes, ingredients);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Ingredients</h1>
      <p className="mt-1 text-sm text-text-muted">
        {ingredients.length} entries, per 100 g. Shared by every recipe, so a correction
        here fixes every recipe at once. Density (ρ) converts a volume to a mass; per-item
        mass (μ) converts a count. Without them a cup or a count cannot be weighed, and
        the ingredient is reported as a coverage gap rather than given a default.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-3xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
              <th className="py-2 pr-3 font-medium">Ingredient</th>
              <th className="py-2 pr-3 text-right font-medium">kcal</th>
              <th className="py-2 pr-3 text-right font-medium">Protein</th>
              <th className="py-2 pr-3 text-right font-medium">Carbs</th>
              <th className="py-2 pr-3 text-right font-medium">Fat</th>
              <th className="py-2 pr-3 text-right font-medium">ρ g/ml</th>
              <th className="py-2 pr-3 text-right font-medium">μ g</th>
              <th className="py-2 pr-3 font-medium">Per</th>
              <th className="py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ingredient) => (
              <Fragment key={ingredient.name}>
                <tr className="align-top">
                  <td className="py-2 pr-3">{ingredient.name}</td>
                  <td className="numeric py-2 pr-3 text-right">
                    {decimal(ingredient.kcal100g, 1)}
                  </td>
                  <td className="numeric py-2 pr-3 text-right">
                    {decimal(ingredient.protein100g, 1)}
                  </td>
                  <td className="numeric py-2 pr-3 text-right">
                    {decimal(ingredient.carbs100g, 1)}
                  </td>
                  <td className="numeric py-2 pr-3 text-right">
                    {decimal(ingredient.fat100g, 1)}
                  </td>
                  <td className="numeric py-2 pr-3 text-right">
                    {decimalOrDash(ingredient.densityGPerMl)}
                  </td>
                  <td className="numeric py-2 pr-3 text-right">
                    {decimalOrDash(ingredient.gramsPerUnit, 1)}
                  </td>
                  {/* What one μ is called. Without it the column is a mass
                      with nothing to attach to, and a recipe cannot turn
                      400 g of cabbage back into a head. */}
                  <td className="py-2 pr-3 text-xs text-text-muted">
                    {ingredient.unitName ?? "—"}
                  </td>
                  <td className="py-2 text-xs text-text-muted">
                    {ingredient.sourceNote ?? ingredient.usdaFdcId ?? "—"}
                  </td>
                </tr>
                {/* Storage runs full width beneath its row rather than in a
                  column of its own: it is a sentence or two of prose, and a
                  ninth column of prose would set the width of the whole table
                  and push the numbers off the side of the screen. */}
                {ingredient.keeping ? (
                  <tr>
                    <td colSpan={9} className="pb-2 text-xs text-text-muted">
                      <span className="font-medium">Storage</span> — {ingredient.keeping}
                    </td>
                  </tr>
                ) : null}
                {/* What it is for, folded away. A `<details>` and not a
                    control: it opens with no JavaScript, which matters on a
                    page whose entire purpose is to be checkable. */}
                <tr className="border-b border-border/60">
                  <td colSpan={9} className="pb-2">
                    <UsedIn uses={usedIn[ingredient.name] ?? []} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-text-muted">
        <Link href="/" className="underline hover:text-text">
          Back to the collection
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { loadCollection } from "@/lib/content/library";
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
 */
export default function IngredientsPage() {
  const { ingredients } = loadCollection();

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
              <th className="py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ingredient) => (
              <tr key={ingredient.name} className="border-b border-border/60 align-top">
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
                <td className="py-2 text-xs text-text-muted">
                  {ingredient.sourceNote ?? ingredient.usdaFdcId ?? "—"}
                </td>
              </tr>
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

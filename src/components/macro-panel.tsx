import { energySplit, type NutritionResult } from "@/lib/nutrition/compute";

/**
 * Per-serving macro panel.
 *
 * Two things this component insists on:
 *
 *  1. **Coverage is shown, always.** A macro figure computed from 60% of a
 *     recipe's mass is not the same object as one computed from all of it, and
 *     presenting them identically is the failure this whole subsystem exists to
 *     avoid.
 *  2. **The bar is energy-weighted.** Fat carries 9 kcal/g against 4 for
 *     protein and carbohydrate, so a mass-proportioned bar would understate its
 *     contribution to the number most people are reading the panel for.
 */

function round(value: number, places = 0): string {
  const factor = 10 ** places;
  return String(Math.round(value * factor) / factor);
}

/** Coverage below this is reported as materially incomplete rather than a caveat. */
const LOW_COVERAGE = 0.9;

export function MacroPanel({
  nutrition,
  servingLabel,
}: {
  nutrition: NutritionResult;
  servingLabel: string;
}) {
  const { perServing, coverage, massUnknownCount, noQuantityCount } = nutrition;
  const split = energySplit(perServing);
  const gaps = nutrition.contributions.filter((c) => c.gap === "unresolved");
  const coveragePct = Math.round(coverage * 100);
  const low = coverage < LOW_COVERAGE;

  const hasAnything = perServing.kcal > 0;

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Per {servingLabel}
        </h2>
        <span
          className={`numeric text-xs ${low ? "text-warn" : "text-text-muted"}`}
          title="Share of the recipe's determinable mass that carries nutrition data"
        >
          {coveragePct}% of mass covered
        </span>
      </div>

      {!hasAnything ? (
        <p className="mt-3 text-sm text-text-muted">
          No nutrition data yet. Resolve the ingredients below, or add them to the
          ingredient library by hand.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-4">
            <span className="numeric text-2xl font-semibold">
              {round(perServing.kcal)}
            </span>
            <span className="text-sm text-text-muted">kcal</span>
          </div>

          {/* Energy split. The bar and the figures below it are the same data
              twice: the bar for shape, the figures for entry into a tracker. */}
          <div
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={`Energy split: protein ${round(split.proteinPct)}%, carbohydrate ${round(
              split.carbsPct,
            )}%, fat ${round(split.fatPct)}%`}
          >
            <div style={{ width: `${split.proteinPct}%`, background: "var(--ok)" }} />
            <div style={{ width: `${split.carbsPct}%`, background: "var(--accent)" }} />
            <div style={{ width: `${split.fatPct}%`, background: "var(--warn)" }} />
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-text-muted">Protein</dt>
              <dd className="numeric font-medium">{round(perServing.protein, 1)} g</dd>
              <dd className="numeric text-xs text-text-muted">
                {round(split.proteinPct)}% energy
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Carbs</dt>
              <dd className="numeric font-medium">{round(perServing.carbs, 1)} g</dd>
              <dd className="numeric text-xs text-text-muted">
                {round(split.carbsPct)}% energy
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Fat</dt>
              <dd className="numeric font-medium">{round(perServing.fat, 1)} g</dd>
              <dd className="numeric text-xs text-text-muted">
                {round(split.fatPct)}% energy
              </dd>
            </div>
          </dl>

          <p className="numeric mt-2 text-xs text-text-muted">
            Fibre {round(perServing.fiber, 1)} g · Sugar {round(perServing.sugar, 1)} g ·
            Sodium {round(perServing.sodiumMg)} mg
          </p>

          {/* How to read the bar. Required by the visualisation standard: a
              chart without an interpretation is decoration. */}
          <p className="mt-3 text-xs text-text-muted">
            The bar shows where the energy comes from, not the mass — fat carries 9 kcal
            per gram against 4 for protein and carbohydrate, so equal weights are not
            equal calories.
          </p>
        </>
      )}

      {(gaps.length > 0 || massUnknownCount > 0 || noQuantityCount > 0) && (
        <div className="mt-4 border-t border-border pt-3">
          {low ? (
            <p className="mb-2 text-xs font-medium text-warn">
              These figures cover {coveragePct}% of the recipe by mass. Treat them as a
              lower bound.
            </p>
          ) : null}

          <ul className="flex flex-col gap-1 text-xs text-text-muted">
            {gaps.map((gap) => (
              <li key={gap.id}>
                <span className="font-medium">{gap.name}</span> — mass known, no nutrition
                data
              </li>
            ))}
            {massUnknownCount > 0 ? (
              <li>
                {massUnknownCount} ingredient{massUnknownCount === 1 ? "" : "s"} whose
                weight cannot be determined, so excluded from the coverage figure entirely
              </li>
            ) : null}
            {noQuantityCount > 0 ? (
              <li>
                {noQuantityCount} ingredient{noQuantityCount === 1 ? "" : "s"} with no
                stated amount
              </li>
            ) : null}
          </ul>
        </div>
      )}
    </section>
  );
}

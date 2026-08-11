import { energySplit, type NutritionResult } from "@/lib/nutrition/compute";
import {
  formatNutrient,
  nutrientDef,
  nutrientsInGroup,
  percentOfReference,
  type NutrientDef,
  type NutrientKey,
} from "@/lib/nutrition/nutrients";

/**
 * Per-serving nutrition.
 *
 * Three things this component insists on:
 *
 *  1. **Coverage is shown, always, and per nutrient.** A figure computed from
 *     60% of a recipe's mass is not the same object as one computed from all of
 *     it, and presenting them identically is the failure this whole subsystem
 *     exists to avoid. That applies with more force to the micronutrients than
 *     to the macros: every library entry carries energy and protein, but only
 *     some carry zinc, so a recipe at full coverage can still have a zinc
 *     figure drawn from a third of its mass.
 *  2. **The bar is energy-weighted.** Fat carries 9 kcal/g against 4 for
 *     protein and carbohydrate, so a mass-proportioned bar would understate its
 *     contribution to the number most people are reading the panel for.
 *  3. **The vitamins and minerals are one click away, not on the page.** They
 *     are twelve rows that answer a question nobody asks while cooking. The
 *     four figures a tracker wants are in front of you; the rest opens.
 */

function round(value: number, places = 0): string {
  const factor = 10 ** places;
  return String(Math.round(value * factor) / factor);
}

/** Coverage below this is reported as materially incomplete rather than a caveat. */
const LOW_COVERAGE = 0.9;

/** Already shown as a column above the label block; not repeated inside it. */
const IN_THE_GRID = new Set<string>(["protein", "carbs", "fat"]);

/**
 * One nutrient: what there is of it, and how much of the recipe that came from.
 *
 * The mass share is shown only when it is materially incomplete. Printing
 * "100% of mass" against every row would make the exceptions harder to see, not
 * easier, which is the opposite of the point.
 */
function NutrientRow({
  def,
  value,
  coverage,
}: {
  def: NutrientDef;
  value: number;
  coverage: number;
}) {
  const key = def.key as NutrientKey;
  const pct = percentOfReference(key, value);
  const known = coverage > 0;

  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt
        className={`text-xs ${def.subordinate ? "pl-3 text-text-muted" : "text-text-muted"}`}
      >
        {def.label}
        {known && coverage < LOW_COVERAGE ? (
          <span
            className="numeric ml-1.5 text-text-muted/60"
            title="Share of the recipe's mass carrying a figure for this nutrient"
          >
            {Math.round(coverage * 100)}% of mass
          </span>
        ) : null}
      </dt>
      <dd className="numeric shrink-0 text-xs">
        {known ? (
          <>
            <span className="font-medium">{formatNutrient(key, value)}</span>
            <span className="text-text-muted"> {def.unit}</span>
            {pct === null ? null : (
              <span className="ml-2 text-text-muted">{round(pct)}% RI</span>
            )}
          </>
        ) : (
          <span className="text-text-muted/60">no data</span>
        )}
      </dd>
    </div>
  );
}

export function MacroPanel({
  nutrition,
  servingLabel,
}: {
  nutrition: NutritionResult;
  servingLabel: string;
}) {
  const { perServing, coverage, nutrientCoverage, massUnknownCount, noQuantityCount } =
    nutrition;
  const split = energySplit(perServing);
  const gaps = nutrition.contributions.filter((c) => c.gap === "unresolved");
  const coveragePct = Math.round(coverage * 100);
  const low = coverage < LOW_COVERAGE;

  const hasAnything = perServing.kcal > 0;

  // Sodium is left out of the disclosure because it is already on the label
  // block above it, where a cook actually looks for it.
  const micronutrients = [
    ...nutrientsInGroup("mineral").filter((def) => def.key !== "sodiumMg"),
    ...nutrientsInGroup("vitamin"),
  ];
  // Micronutrient data is the sparse part of the library, so the disclosure
  // says up front how much of it there is. "Vitamins and minerals" over twelve
  // rows of "no data" is a worse answer than saying so on the summary line.
  const knownMicros = micronutrients.filter(
    (def) => nutrientCoverage[def.key as NutrientKey] > 0,
  ).length;

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
            <span className="numeric text-xs text-text-muted">
              {round(percentOfReference("kcal", perServing.kcal) ?? 0)}% of a 2000 kcal
              day
            </span>
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

          {/* The label block: the nutrients a packet is legally obliged to
              carry, in the order a packet carries them, so the panel can be
              read against one without translation. */}
          <dl className="mt-3 divide-y divide-border border-t border-border">
            {nutrientsInGroup("macro")
              .filter((def) => !IN_THE_GRID.has(def.key))
              .map((def) => (
                <NutrientRow
                  key={def.key}
                  def={def}
                  value={perServing[def.key as NutrientKey]}
                  coverage={nutrientCoverage[def.key as NutrientKey]}
                />
              ))}
            <NutrientRow
              def={nutrientDef("sodiumMg")}
              value={perServing.sodiumMg}
              coverage={nutrientCoverage.sodiumMg}
            />
          </dl>

          <details className="mt-3 border-t border-border pt-2">
            <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
              Vitamins and minerals{" "}
              <span className="numeric">
                ({knownMicros} of {micronutrients.length} known)
              </span>
            </summary>
            <dl className="mt-1 divide-y divide-border">
              {micronutrients.map((def) => (
                <NutrientRow
                  key={def.key}
                  def={def}
                  value={perServing[def.key as NutrientKey]}
                  coverage={nutrientCoverage[def.key as NutrientKey]}
                />
              ))}
            </dl>
            <p className="mt-2 text-xs text-text-muted">
              RI is the daily reference intake for an average adult, from the same
              schedule used on food labelling in Britain and the EU. It is there for
              scale, not as a target. A percentage next to a figure drawn from part of
              the recipe is that part&rsquo;s percentage, and the mass share says which.
            </p>
          </details>

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
          <p className="mt-2 text-xs text-text-muted">
            Every gap here is a missing row in{" "}
            <code>content/ingredients.json</code>, not a limit of the arithmetic. Add the
            ingredient and the figures complete themselves.
          </p>
        </div>
      )}
    </section>
  );
}

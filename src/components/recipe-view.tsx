"use client";

import { useMemo, useState } from "react";
import { MacroPanel } from "@/components/macro-panel";
import { computeNutrition, type NutritionInput } from "@/lib/nutrition/compute";
import { scaleRecipe, type ScalableIngredient } from "@/lib/scaling";
import {
  ALL_STANDARD_TINS,
  describeTin,
  scaleForTin,
  tinAdviceText,
  type Tin,
} from "@/lib/tin";

/**
 * The ingredients, the method, and the macro panel, at whatever serving count
 * you have chosen.
 *
 * A client component, and the one place this re-platform genuinely changed the
 * design rather than just moving it. On the server build the serving count
 * lived in the URL (`?servings=6`), which made a scaled recipe a shareable link
 * and cost no JavaScript. A static export cannot render per-query-parameter —
 * there is no server to render it — so the count becomes React state.
 *
 * What is lost: a scaled recipe is no longer its own URL. What is kept: the
 * page still renders completely without JavaScript at the recipe's own serving
 * count, because this component is prerendered at build time. Someone with
 * JavaScript disabled gets the recipe as written, which is the thing that
 * matters; they lose the stepper, which is a convenience.
 *
 * All the arithmetic is the same pure code the server build used, unchanged.
 */
export function RecipeView({
  baseServings,
  servingLabel,
  scalable,
  nutrition,
  steps,
  tin = null,
}: {
  baseServings: number;
  servingLabel: string;
  scalable: ScalableIngredient[];
  nutrition: NutritionInput[];
  steps: string[];
  tin?: Tin | null;
}) {
  const [servings, setServings] = useState(baseServings);
  const [chosenTinLabel, setChosenTinLabel] = useState("");

  /**
   * Choosing a tin sets the serving count, rather than being a separate scale.
   *
   * One quantity governs the page — alpha — and both controls write to it. Two
   * independent scales would let the tin and the servings disagree, and a
   * recipe that says "12 slices" while sized for a tin holding eight is worse
   * than either control alone.
   */
  function chooseTin(label: string): void {
    setChosenTinLabel(label);
    if (!tin || label === "") {
      setServings(baseServings);
      return;
    }
    const option = ALL_STANDARD_TINS.find((entry) => entry.label === label);
    const alpha = option ? scaleForTin(tin, option.tin) : null;
    if (alpha !== null) {
      // One decimal: 10.5 slices is honest, 10.4736 is noise.
      setServings(Math.round(baseServings * alpha * 10) / 10);
    }
  }

  const scaled = useMemo(
    () => scaleRecipe(scalable, baseServings, servings),
    [scalable, baseServings, servings],
  );
  // `computeNutrition` divides by `servings * scale`, so the serving count it
  // is given must be the BASE one and `scale` carries alpha. Passing the target
  // count here as well divides by base * alpha^2, which breaks the invariant
  // that per-serving macros do not change when a recipe is scaled — subtly, and
  // only once someone touches the stepper.
  const macros = useMemo(
    () =>
      computeNutrition(nutrition, baseServings, {
        scale: servings / baseServings,
      }),
    [nutrition, servings, baseServings],
  );

  const isScaled = Math.abs(scaled.factor - 1) > 1e-9;
  // A cake batter doubled into the same tin is twice as deep and bakes wrongly.
  // The tin has to scale with the recipe, and by the square root of alpha.
  const tinNote = tin ? tinAdviceText(tin, scaled.factor) : null;
  // A step of one serving is right for 4 people and absurd for 24 cookies.
  const step = baseServings >= 12 ? Math.round(baseServings / 12) : 1;

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setChosenTinLabel("");
            setServings((n) => Math.max(step, n - step));
          }}
          className="h-9 w-9 rounded-card border border-border bg-surface text-lg leading-none"
          aria-label="Fewer servings"
        >
          −
        </button>
        <span className="numeric min-w-28 text-center text-sm">
          {Number.isInteger(servings) ? servings : servings.toFixed(1)} {servingLabel}
          {servings === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => {
            setChosenTinLabel("");
            setServings((n) => n + step);
          }}
          className="h-9 w-9 rounded-card border border-border bg-surface text-lg leading-none"
          aria-label="More servings"
        >
          +
        </button>
        {isScaled ? (
          <button
            type="button"
            onClick={() => {
              setChosenTinLabel("");
              setServings(baseServings);
            }}
            className="ml-1 text-xs text-text-muted hover:text-text"
          >
            Reset
          </button>
        ) : null}
      </div>

      {tin ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          <span>
            Written for a {describeTin(tin)}
            {tin.depth ? `, ${tin.depth} cm deep` : ""}.
          </span>
          {/* The question a cook actually has is not "what tin does this want?"
              but "I have this tin — how much do I make?". Choosing a tin sets
              the serving count from the ratio of the areas, so the quantities
              and the macros follow. It is the same alpha as the stepper, driven
              from the other end. */}
          <label className="flex items-center gap-2">
            <span>I have a</span>
            <select
              value={chosenTinLabel}
              onChange={(event) => chooseTin(event.target.value)}
              aria-label="The tin you are baking in"
              className="rounded-card border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
            >
              <option value="">{describeTin(tin)} (as written)</option>
              {ALL_STANDARD_TINS.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {tinNote ? (
        <p className="mt-2 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn">
          {tinNote}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
          Ingredients
        </h2>
        <ul className="flex flex-col gap-1.5">
          {scaled.ingredients.map((ingredient) => (
            <li key={ingredient.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                {/* Unscaled, the line as written is authoritative and is shown
                    verbatim. The reconstructed parse appears only once scaled,
                    which is the only case where the stored text would be wrong. */}
                <span>{isScaled ? ingredient.display : ingredient.rawText}</span>
                {ingredient.passedThrough && isScaled ? (
                  <span
                    className="shrink-0 text-xs text-text-muted"
                    title="Excluded from scaling — multiplying it would produce a wrong amount"
                  >
                    (not scaled)
                  </span>
                ) : null}
              </div>
              {ingredient.advisory ? (
                <p className="mt-1 rounded-card bg-warn-soft px-2 py-1 text-xs text-warn">
                  {ingredient.advisory}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {scaled.advisories.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            {scaled.advisories.map((advisory) => (
              <p
                key={advisory.kind}
                className="rounded-card bg-warn-soft px-3 py-2 text-xs text-warn"
              >
                {advisory.text}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <MacroPanel nutrition={macros} servingLabel={servingLabel} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">Method</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step_, index) => (
            <li key={`${index}-${step_.slice(0, 24)}`} className="flex gap-3 text-sm">
              <span className="numeric shrink-0 text-text-muted">{index + 1}</span>
              <span>{step_}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

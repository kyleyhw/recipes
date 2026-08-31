"use client";

import { useMemo, useState } from "react";
import { useLanguage, useT } from "@/components/language";
import type { RecipeTranslation } from "@/lib/content/format";
import { translate, type StringKey } from "@/lib/i18n/strings";
import { MacroPanel } from "@/components/macro-panel";
import { RecipeDiagram } from "@/components/recipe-diagram";
import type { Diagram } from "@/lib/content/diagram";
import { computeNutrition, type NutritionInput } from "@/lib/nutrition/compute";
import type { LineLibrary } from "@/lib/content/prepare";
import { useIngredientLibrary } from "@/components/ingredient-library";
import { pluralise, renderCount, renderMadeUp } from "@/lib/count";
import { getUnit, toBase, toGrams } from "@/lib/units";
import { renderQuantity } from "@/lib/quantity";
import { scaleRecipe, type ScalableIngredient } from "@/lib/scaling";
import {
  describeTin,
  DIMENSIONS_FOR_SHAPE,
  scaleForTin,
  tinAdviceText,
  TIN_SHAPES,
  type Tin,
  type TinShape,
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
  title,
  baseServings,
  servingLabel,
  scalable,
  nutrition,
  library = [],
  steps,
  tin = null,
  translations = {},
  diagram = null,
}: {
  title: string;
  baseServings: number;
  servingLabel: string;
  scalable: ScalableIngredient[];
  nutrition: NutritionInput[];
  /**
   * What each ingredient line resolved to in the library, index by index with
   * `scalable`. Null for a line that matched nothing — the same lines the
   * coverage figure counts as a gap — and empty when the caller has no library
   * to hand, in which case the lines are plain text and nothing is clickable.
   */
  library?: Array<LineLibrary | null>;
  steps: string[];
  tin?: Tin | null;
  /**
   * The recipe in other languages, keyed by code. Only the words: every
   * quantity, every unit and every macro is still computed from the English
   * recipe, which is the only one the ingredient library and the parser know
   * how to read.
   */
  translations?: Record<string, RecipeTranslation>;
  /** The method as a tree, already placed. Null where the recipe has none. */
  diagram?: Diagram | null;
}) {
  const [servings, setServings] = useState(baseServings);
  /**
   * The tin you have, as you are filling it in.
   *
   * Held as strings rather than numbers because a half-typed "2" on the way to
   * "23" is a number, and coercing as you type would rescale the recipe to a
   * 2 cm tin between keystrokes. It is read as a number only when it is
   * complete enough to mean something.
   */
  const [yourTin, setYourTin] = useState<{
    shape: TinShape | "";
    diameter: string;
    length: string;
    width: string;
    depth: string;
  }>({ shape: "", diameter: "", length: "", width: "", depth: "" });
  const t = useT();
  const language = useLanguage();
  // Null when this view is rendered outside the provider, in which case the
  // ingredient lines stay plain text.
  const openLibrary = useIngredientLibrary();
  const translated = translations[language] ?? null;

  /**
   * Rescales to the tin you have, as soon as it has enough to go on.
   *
   * Setting the serving count rather than holding a second scale of its own:
   * one quantity governs the page — alpha — and both controls write to it. Two
   * independent scales would let the tin and the servings disagree, and a
   * recipe that says "12 slices" while sized for a tin holding eight is worse
   * than either control alone.
   *
   * Depth is asked for but does not enter alpha. Area is what decides how much
   * batter fits; depth decides how it *bakes*, and feeds the advisory instead.
   */
  function updateTin(next: typeof yourTin): void {
    setYourTin(next);

    const number = (value: string): number | null => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    if (!tin || next.shape === "") {
      setServings(baseServings);
      return;
    }

    // Square tins are entered as one side, so the width is the length.
    const length = number(next.length);
    const candidate: Tin = {
      shape: next.shape,
      diameter: number(next.diameter) ?? undefined,
      length: length ?? undefined,
      width: (next.shape === "square" ? length : number(next.width)) ?? undefined,
      depth: number(next.depth) ?? undefined,
    };

    const alpha = scaleForTin(tin, candidate);
    // Null while the dimensions that matter are still blank or half-typed.
    if (alpha === null) return;
    // One decimal: 10.5 slices is honest, 10.4736 is noise.
    setServings(Math.round(baseServings * alpha * 10) / 10);
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

  /**
   * One ingredient line, in the reader's language.
   *
   * Assembled rather than translated: the amount comes from the arithmetic, the
   * unit from the string table, and only the name from the translation. That is
   * why the translation files hold names and not lines — a line with the number
   * written into it would be correct at ten slices and quietly wrong at
   * fifteen.
   *
   * Falls back to English per line, so a translation short one name degrades to
   * one English ingredient rather than to none.
   */
  function ingredientLine(
    ingredient: (typeof scaled.ingredients)[number],
    index: number,
    share: number | null = null,
  ): string {
    const name = translated?.ingredientNames[index] ?? ingredient.name;

    // A share is a *part* of the line — "1/3 peanut oil" — so it is rendered
    // as the amount that part actually comes to: 3 tbsp becomes 1 tbsp, and
    // stays a third of whatever 3 tbsp becomes when the recipe is scaled.
    if (share !== null && ingredient.scaledQuantity !== null) {
      const part = renderQuantity(ingredient.scaledQuantity * share, ingredient.unit);
      const partUnit = part.unitKey
        ? translate(language, `unit.${part.unitKey}` as StringKey)
        : "";
      return [part.amount, partUnit, name].filter(Boolean).join(" ");
    }

    if (!translated || !translated.ingredientNames[index]) {
      return isScaled ? ingredient.display : ingredient.rawText;
    }
    if (ingredient.passedThrough || !ingredient.rendered) return name;

    const unit = ingredient.rendered.unitKey
      ? translate(language, `unit.${ingredient.rendered.unitKey}` as StringKey)
      : "";
    return [ingredient.rendered.amount, unit, name].filter(Boolean).join(" ");
  }

  /**
   * What the ingredient library adds to one line, at the current scale.
   *
   * Both figures are derived rather than written into the recipe, and that is
   * the point: a hand-typed "(1 head)" is right at four servings and a lie at
   * eight, whereas this is recomputed from mu every time the stepper moves.
   *
   * The count is suppressed where the line already carries a bracket of its
   * own. "400 g cucumber (2 short ones)" says something mu cannot — which
   * cucumber to buy — and two brackets on one line, disagreeing about the
   * count, is worse than either alone.
   *
   * The noun is English wherever the reader is, like `keeping` and the
   * ingredient names in the library drawer. A number and an English noun is
   * still a useful thing to carry to a shop; a translated noun this table does
   * not have would be a blank.
   */
  function lineExtras(
    ingredient: (typeof scaled.ingredients)[number],
    index: number,
  ): { count: string | null; madeUp: string | null } {
    const nothing = { count: null, madeUp: null };
    const entry = library[index] ?? null;
    const quantity = ingredient.scaledQuantity;
    if (!entry || quantity === null) return nothing;

    // A line with no unit is already a count — "4 eggs" — and saying "(4 eggs)"
    // after it helps nobody.
    const dimension = ingredient.unit
      ? (getUnit(ingredient.unit)?.dimension ?? null)
      : null;
    if (dimension !== "mass" && dimension !== "volume") return nothing;

    let count: string | null = null;
    if (entry.gramsPerUnit && entry.unitName && !ingredient.rawText.includes("(")) {
      const grams = toGrams(quantity, ingredient.unit, {
        densityGPerMl: entry.densityGPerMl,
        gramsPerUnit: entry.gramsPerUnit,
      });
      const rendered =
        grams === null
          ? null
          : renderCount(grams, {
              gramsPerUnit: entry.gramsPerUnit,
              unitName: entry.unitName,
              unitNamePlural: entry.unitNamePlural,
            });
      if (rendered) {
        count = rendered.approximate
          ? t("approximately", { text: rendered.text })
          : rendered.text;
      }
    }

    let madeUp: string | null = null;
    if (entry.madeUp && dimension === "volume") {
      const ml = toBase(quantity, ingredient.unit ?? "");
      const rendered = ml === null ? null : renderMadeUp(ml, entry.madeUp);
      // The water is quoted in the unit the line itself is quoted in. Scaled up,
      // 900 ml of dashi becomes "1.8 l" on the line, and telling the same cook
      // to boil "1800 ml" underneath it is two units for one pan of water.
      const unitKey = ingredient.rendered?.unitKey;
      const amount = ingredient.rendered
        ? [
            ingredient.rendered.amount,
            unitKey ? translate(language, `unit.${unitKey}` as StringKey) : "",
          ]
            .filter(Boolean)
            .join(" ")
        : null;
      if (rendered && amount) {
        madeUp = t("madeUpLine", { n: rendered.text, amount });
      }
    }

    return { count, madeUp };
  }

  function clearTin(): void {
    setYourTin({ shape: "", diameter: "", length: "", width: "", depth: "" });
  }

  const shownSteps = translated?.steps.length ? translated.steps : steps;
  const shownServingLabel = translated?.servingLabel ?? servingLabel;
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
            clearTin();
            setServings((n) => Math.max(step, n - step));
          }}
          className="h-9 w-9 rounded-card border border-border bg-surface text-lg leading-none"
          aria-label={t("fewerServings")}
        >
          −
        </button>
        <span className="numeric min-w-28 text-center text-sm">
          {Number.isInteger(servings) ? servings : servings.toFixed(1)}{" "}
          {/* Only English pluralises at all. The other three tables give a
              serving label that reads correctly for any count. */}
          {language === "en" && servings !== 1
            ? pluralise(shownServingLabel)
            : shownServingLabel}
        </span>
        <button
          type="button"
          onClick={() => {
            clearTin();
            setServings((n) => n + step);
          }}
          className="h-9 w-9 rounded-card border border-border bg-surface text-lg leading-none"
          aria-label={t("moreServings")}
        >
          +
        </button>
        {/* Always here, not only once the count has moved. A control that
            appears when you have already changed something is one you find by
            accident; this one says what the recipe's own size is and puts it
            back. */}
        <button
          type="button"
          onClick={() => {
            clearTin();
            setServings(baseServings);
          }}
          disabled={!isScaled}
          className="ml-1 text-xs text-text-muted hover:text-text disabled:opacity-40 disabled:hover:text-text-muted"
        >
          {t("reset")}
        </button>
      </div>

      {tin ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          <span>
            {t("writtenForTin", { tin: describeTin(tin) })}
            {tin.depth ? t("tinDepth", { n: tin.depth }) : ""}.
          </span>
          {/* The question a cook actually has is not "what tin does this
              want?" but "I have this tin — how much do I make?". The shape is
              asked first because the shape decides what there is to measure: a
              round tin has a diameter and no sides, a rectangular one has two
              sides and no diameter. Asking for all four at once and greying
              three of them out invites someone to fill in a diameter for a
              loaf tin. */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span>{t("yourTin")}</span>
              <select
                value={yourTin.shape}
                onChange={(event) =>
                  updateTin({
                    ...yourTin,
                    shape: event.target.value as TinShape | "",
                  })
                }
                aria-label={t("tinShape")}
                className="rounded-card border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
              >
                <option value="">{t("tinAsWritten")}</option>
                {TIN_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {t(`tin${shape[0]!.toUpperCase()}${shape.slice(1)}` as StringKey)}
                  </option>
                ))}
              </select>
            </label>

            {yourTin.shape === ""
              ? null
              : DIMENSIONS_FOR_SHAPE[yourTin.shape].map((dimension) => {
                  // A square is entered as one side rather than as two equal
                  // ones, so its `length` field is labelled "side".
                  const label =
                    dimension === "length" && yourTin.shape === "square"
                      ? t("tinSide")
                      : t(
                          `tin${dimension[0]!.toUpperCase()}${dimension.slice(1)}${
                            dimension === "depth" ? "Label" : ""
                          }` as StringKey,
                        );

                  return (
                    <label key={dimension} className="flex items-center gap-1.5">
                      <span>{label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="1"
                        step="0.5"
                        value={yourTin[dimension]}
                        onChange={(event) =>
                          updateTin({ ...yourTin, [dimension]: event.target.value })
                        }
                        className="numeric w-16 rounded-card border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
                      />
                      <span className="text-text-muted">{t("tinCm")}</span>
                    </label>
                  );
                })}
          </div>
        </div>
      ) : null}

      {tinNote ? (
        <p className="mt-2 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn">
          {tinNote}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
          {t("ingredients")}
        </h2>
        <ul className="flex flex-col gap-1.5">
          {scaled.ingredients.map((ingredient, index) => {
            const entry = library[index] ?? null;
            const extras = lineExtras(ingredient, index);
            // Unscaled, the line as written is authoritative and is shown
            // verbatim. The reconstructed parse appears only once scaled,
            // which is the only case where the stored text would be wrong.
            const text = ingredientLine(ingredient, index);
            const count = extras.count ? (
              <span className="text-text-muted"> ({extras.count})</span>
            ) : null;

            return (
              <li key={ingredient.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  {/* A line that resolved to the library opens it. Every macro
                      figure on the page is built out of these rows, so the
                      question "where did that number come from?" is asked at
                      the line, and this is the shortest path from asking it to
                      the answer. A line that resolved to nothing is not a
                      button, because there would be nothing to show. */}
                  {entry && openLibrary ? (
                    <button
                      type="button"
                      onClick={() => openLibrary.open(entry.name)}
                      title={t("openInLibrary", { name: entry.name })}
                      className="cursor-pointer text-left underline decoration-border decoration-dotted underline-offset-4 hover:decoration-accent"
                    >
                      {text}
                      {count}
                    </button>
                  ) : (
                    <span>
                      {text}
                      {count}
                    </span>
                  )}
                  {ingredient.passedThrough && isScaled ? (
                    <span
                      className="shrink-0 text-xs text-text-muted"
                      title={t("notScaledTitle")}
                    >
                      {t("notScaled")}
                    </span>
                  ) : null}
                </div>
                {/* How to make the thing the line asks for, for the ones nobody
                    makes from scratch. Under the line rather than in brackets
                    after it: it is an instruction, not a quantity. */}
                {extras.madeUp ? (
                  <p className="mt-0.5 text-xs text-text-muted">{extras.madeUp}</p>
                ) : null}
                {ingredient.advisory ? (
                  <p className="mt-1 rounded-card bg-warn-soft px-2 py-1 text-xs text-warn">
                    {ingredient.advisory}
                  </p>
                ) : null}
              </li>
            );
          })}
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
        <MacroPanel nutrition={macros} servingLabel={shownServingLabel} />
      </section>

      {/* The diagram lives with the method rather than beside the ingredients,
          because it is a second reading of the same thing: the list says what
          to do in order, the table says what meets what. Both are built from
          the same scaled, translated lines. */}
      {diagram ? (
        <RecipeDiagram
          diagram={diagram}
          title={translated?.title ?? title}
          servings={`${Number.isInteger(servings) ? servings : servings.toFixed(1)} ${
            language === "en" && servings !== 1
              ? pluralise(shownServingLabel)
              : shownServingLabel
          }`}
          line={(index, share) => {
            const ingredient = scaled.ingredients[index];
            return ingredient ? ingredientLine(ingredient, index, share) : null;
          }}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
          {t("method")}
        </h2>
        <ol className="flex flex-col gap-3">
          {shownSteps.map((step_, index) => (
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

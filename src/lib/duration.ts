import type { Language, StringKey } from "@/lib/i18n/strings";

/**
 * Saying how long something takes, in words.
 *
 * Everything here used to be minutes, which was fine while the longest number
 * on the site was ninety. Counting the fridge changed that: a pork belly dries
 * for twelve hours and a cheesecake sets overnight, and "720 min" is a number
 * a reader has to do arithmetic on before it means anything.
 *
 * Exact, always, and that is a constraint rather than an oversight. The parts
 * and the total are printed side by side on every card — "15 min prep · 5 min
 * heat · 4 h chill · 4 h 20 min total" — so any rounding that makes the sum
 * disagree with its addends turns the line into an arithmetic error the reader
 * can see. An earlier draft rounded to the half hour past two hours, on the
 * argument that nobody plans an afternoon around ten minutes, and it printed
 * 4 h 20 as 4 h 30 directly beside the numbers that made it. Legibility is not
 * worth that.
 *
 * The strings themselves live in the table like everything else, because
 * "1 h 30 min" is "1 小時 30 分鐘" and word order is not universal.
 */

export function formatDuration(
  minutes: number,
  t: (key: StringKey, vars?: Record<string, string | number>) => string,
): string {
  if (minutes < 60) return t("durMin", { n: minutes });

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return t("durHr", { n: hours });
  return t("durHrMin", { h: hours, m: rest });
}

/** The three stretches a recipe can take, added up. */
export function totalMinutes(recipe: {
  prepMinutes: number | null;
  cookMinutes: number | null;
  waitMinutes: number | null;
}): number | null {
  const parts = [recipe.prepMinutes, recipe.cookMinutes, recipe.waitMinutes];
  if (parts.every((part) => part === null)) return null;
  return parts.reduce((sum: number, part) => sum + (part ?? 0), 0);
}

export type { Language };

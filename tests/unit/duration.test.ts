import { describe, expect, it } from "vitest";
import { formatDuration, totalMinutes } from "@/lib/duration";
import { translate, type StringKey } from "@/lib/i18n/strings";

/**
 * Tests for saying how long a recipe takes.
 *
 * The interesting cases are all at the boundaries, and the reason they matter
 * is that this number is the one a reader decides on. Counting the fridge made
 * the range enormous — twelve hours of drying, a night of setting — and a
 * format that reads well at 25 minutes reads badly at 720.
 */

const t = (key: StringKey, vars?: Record<string, string | number>) =>
  translate("en", key, vars);

describe("formatting a duration", () => {
  it("shows plain minutes below an hour", () => {
    expect(formatDuration(5, t)).toBe("5 min");
    expect(formatDuration(59, t)).toBe("59 min");
  });

  it("shows a bare hour count when the minutes are zero", () => {
    expect(formatDuration(60, t)).toBe("1 h");
    expect(formatDuration(240, t)).toBe("4 h");
    expect(formatDuration(720, t)).toBe("12 h");
  });

  /** Between one and two hours every minute still decides something. */
  it("keeps the exact minutes up to two hours", () => {
    expect(formatDuration(90, t)).toBe("1 h 30 min");
    expect(formatDuration(105, t)).toBe("1 h 45 min");
    expect(formatDuration(119, t)).toBe("1 h 59 min");
  });

  /**
   * The one that has to hold, because a card prints the parts and their sum on
   * the same line, written as a sum: "15 min prep + 5 min fry + 4 h chill =
   * 4 h 20 min total". Rounding 260 to "4 h 30 min" there is an addition
   * anybody can check and find wrong, and the equals sign invites them to.
   */
  it("stays exact past two hours, so the parts add up to the total", () => {
    expect(formatDuration(250, t)).toBe("4 h 10 min");
    expect(formatDuration(260, t)).toBe("4 h 20 min");
    expect(formatDuration(140, t)).toBe("2 h 20 min");
    const parts = [15, 5, 240];
    expect(
      formatDuration(
        parts.reduce((a, b) => a + b),
        t,
      ),
    ).toBe("4 h 20 min");
  });

  it("never leaves an unfilled placeholder", () => {
    for (const minutes of [1, 59, 60, 61, 119, 120, 121, 719, 720, 1441]) {
      expect(formatDuration(minutes, t)).not.toContain("{");
    }
  });

  it("says it in the reader's language", () => {
    const zh = (key: StringKey, vars?: Record<string, string | number>) =>
      translate("zh-Hant", key, vars);
    expect(formatDuration(90, zh)).toBe("1 小時 30 分鐘");
    expect(formatDuration(45, zh)).toBe("45 分鐘");
  });
});

describe("adding the stretches up", () => {
  it("counts the waiting", () => {
    expect(totalMinutes({ prepMinutes: 15, cookMinutes: 5, waitMinutes: 240 })).toBe(260);
  });

  /**
   * The whole point of the change. A mango pudding is fifteen minutes of work
   * and four hours before anybody eats it, and a card that advertised twenty
   * was not telling the truth.
   */
  it("is not the same as prep plus cook when there is a fridge involved", () => {
    const recipe = { prepMinutes: 15, cookMinutes: 5, waitMinutes: 240 };
    expect(totalMinutes(recipe)).not.toBe(
      (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0),
    );
  });

  it("treats a missing stretch as zero rather than unknown", () => {
    expect(totalMinutes({ prepMinutes: 10, cookMinutes: null, waitMinutes: null })).toBe(
      10,
    );
  });

  /** A recipe that states no times at all is unknown, not instant. */
  it("reports nothing when every stretch is missing", () => {
    expect(
      totalMinutes({ prepMinutes: null, cookMinutes: null, waitMinutes: null }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { SCALE_EPSILON, timeAdviceText, type Stretches } from "@/lib/scaling-time";

/**
 * Tests for what scaling does to the clock.
 *
 * The claim this feature exists to make is an unintuitive one — that doubling a
 * recipe does *not* double the time it takes — so the tests care less about the
 * exact wording than about two things that would make the advice wrong rather
 * than merely clumsy: that it never claims a stretch the recipe does not have,
 * and that it says nothing at all when nothing has been scaled.
 */

const FULL: Stretches = { prepMinutes: 15, cookMinutes: 15, waitMinutes: 60 };
const HOB: Stretches = { prepMinutes: 15, cookMinutes: 15, waitMinutes: null };

describe("saying nothing", () => {
  it("says nothing at the recipe's own serving count", () => {
    expect(timeAdviceText(FULL, 1, { baked: false })).toBeNull();
  });

  it("says nothing for a factor that is one to within floating-point slack", () => {
    expect(timeAdviceText(FULL, 1 + SCALE_EPSILON / 2, { baked: false })).toBeNull();
  });

  it("says nothing about a recipe that states no times", () => {
    const none: Stretches = { prepMinutes: null, cookMinutes: null, waitMinutes: null };
    expect(timeAdviceText(none, 2, { baked: false })).toBeNull();
  });

  it("refuses a factor that is not a positive number", () => {
    expect(timeAdviceText(FULL, 0, { baked: false })).toBeNull();
    expect(timeAdviceText(FULL, -1, { baked: false })).toBeNull();
    expect(timeAdviceText(FULL, Number.NaN, { baked: false })).toBeNull();
  });
});

describe("which stretches it names", () => {
  it("names only the stretches the recipe has", () => {
    // The failure this guards against is a recipe with no fridge step being
    // told its waiting is unaffected, which reads as though a step is missing.
    const text = timeAdviceText(HOB, 2, { baked: false });
    expect(text).not.toBeNull();
    expect(text).not.toContain("waiting");
    expect(text).toContain("the cooking");
  });

  it("names both, and agrees the verb with them, when a recipe has both", () => {
    const text = timeAdviceText(FULL, 2, { baked: false }) ?? "";
    expect(text).toMatch(/the cooking and the waiting stand/);
  });

  it("agrees the verb with a single stretch", () => {
    const cookOnly: Stretches = {
      prepMinutes: null,
      cookMinutes: 15,
      waitMinutes: null,
    };
    expect(timeAdviceText(cookOnly, 2, { baked: false })).toMatch(/the cooking stands/);
  });

  it("says nothing about prep for a recipe that states none", () => {
    const cookOnly: Stretches = {
      prepMinutes: null,
      cookMinutes: 15,
      waitMinutes: null,
    };
    expect(timeAdviceText(cookOnly, 2, { baked: false })).not.toMatch(/prep/i);
  });
});

describe("baked and not baked", () => {
  it("calls it a bake, and credits the tin, for a baked recipe", () => {
    const text = timeAdviceText(FULL, 2, { baked: true }) ?? "";
    expect(text).toContain("the bake");
    expect(text).toContain("tin");
  });

  it("makes the claim unconditional for a tin, which does scale", () => {
    expect(timeAdviceText(FULL, 2, { baked: true })).not.toMatch(/provided the pan/);
  });

  it("makes the claim conditional on the pan off a tin, which does not", () => {
    expect(timeAdviceText(HOB, 2, { baked: false })).toMatch(/provided the pan does too/);
  });

  it("names both ways out when a hob recipe is scaled up", () => {
    const text = timeAdviceText(HOB, 2, { baked: false }) ?? "";
    expect(text).toMatch(/wider/);
    expect(text).toMatch(/in two/);
  });

  it("does not tell a cook to go wider when the recipe is scaled down", () => {
    // Less in the same pan sits shallower, which is nobody's problem.
    const text = timeAdviceText(HOB, 0.5, { baked: false }) ?? "";
    expect(text).not.toMatch(/wider/);
    expect(text).not.toMatch(/in two/);
  });

  it("does not reach for frying, which a drink does not do", () => {
    // An earlier draft framed the pan caution as steaming rather than frying,
    // and told an iced tea recipe to watch out for it. The account has to hold
    // for a wok, a stockpot and a jug in the fridge alike.
    for (const alpha of [0.5, 2]) {
      expect(timeAdviceText(FULL, alpha, { baked: false })).not.toMatch(/fr(y|ies|ying)/);
    }
  });
});

describe("direction", () => {
  it("has prep grow when the recipe grows", () => {
    expect(timeAdviceText(FULL, 2, { baked: false })).toMatch(/prep grows/i);
  });

  it("has prep shrink when the recipe shrinks", () => {
    expect(timeAdviceText(FULL, 0.5, { baked: false })).toMatch(/prep shrinks/i);
  });

  it("never claims a stretch has been multiplied", () => {
    // The whole point: no scaled number is printed, because none can be
    // computed honestly. If a figure ever appears here, something invented it.
    const text = timeAdviceText(FULL, 2, { baked: false }) ?? "";
    expect(text).not.toMatch(/\d+\s*min/);
  });
});

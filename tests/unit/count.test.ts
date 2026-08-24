import { describe, expect, it } from "vitest";
import { pluralise, renderCount, renderMadeUp } from "@/lib/count";

/**
 * Tests for turning a weight back into a number of things.
 *
 * The library stores mu so that a count can become a mass; this runs it the
 * other way, so that a recipe written in grams can say what to put in the
 * basket. The whole risk is in the rounding, because the output is an
 * instruction about physical objects: an eighth of an onion is arithmetically
 * fine and practically meaningless, and a count that reads "0 cloves" is worse
 * than no count at all.
 *
 * The inputs below are the collection's own figures — garlic at 3 g a clove,
 * white cabbage at 900 g a head, dashi at 500 ml a sachet — rather than round
 * numbers invented for the test, so a case that passes here is a case that
 * appears on a page.
 */

const CLOVE = { gramsPerUnit: 3, unitName: "clove" };
const HEAD = { gramsPerUnit: 900, unitName: "head" };
const LEAF = { gramsPerUnit: 1.7, unitName: "leaf", unitNamePlural: "leaves" };

describe("counting items out of a weight", () => {
  it("gives a whole number where the weight is a whole number of items", () => {
    expect(renderCount(21, CLOVE)?.text).toBe("7 cloves");
    expect(renderCount(3, CLOVE)?.text).toBe("1 clove");
    expect(renderCount(1800, HEAD)?.text).toBe("2 heads");
  });

  /**
   * Halves below three, whole numbers above it. A cook halves a cabbage; nobody
   * measures out six and a half cloves of garlic, and offering to is a worse
   * answer than rounding.
   */
  it("keeps halves while they are useful and drops them once they are not", () => {
    expect(renderCount(1350, HEAD)?.text).toBe("1½ heads");
    expect(renderCount(20, CLOVE)?.text).toBe("7 cloves");
    expect(renderCount(19, CLOVE)?.text).toBe("6 cloves");
  });

  /** Rounding is a loss, and a figure that moved more than a tenth says so. */
  it("marks a count the rounding moved", () => {
    // 400 g of a 300 g cucumber is 1.33, shown as 1½ — 12% out, and flagged.
    expect(renderCount(400, { gramsPerUnit: 300, unitName: "cucumber" })).toMatchObject({
      text: "1½ cucumbers",
      approximate: true,
    });
    // 20 g of garlic is 6.67 cloves, shown as 7 — 5% out, and not worth a word.
    expect(renderCount(20, CLOVE)?.approximate).toBe(false);
  });

  /**
   * The failure this is here to prevent: a pinch of something, rendered as a
   * fraction of an object nobody can cut. Silence is the right answer.
   */
  it("says nothing rather than inventing a fraction of an item", () => {
    expect(renderCount(0.7, CLOVE)).toBeNull();
    expect(renderCount(100, HEAD)).toBeNull();
    expect(renderCount(0, CLOVE)).toBeNull();
    expect(renderCount(-5, CLOVE)).toBeNull();
    expect(renderCount(50, { gramsPerUnit: 0, unitName: "clove" })).toBeNull();
  });

  /** "half a cucumber", not "half a cucumbers". */
  it("goes singular below one as well as at one", () => {
    expect(renderCount(450, HEAD)?.text).toBe("½ head");
    expect(renderCount(1350, HEAD)?.text).toBe("1½ heads");
  });

  it("never returns a zero count", () => {
    for (const grams of [0.75, 1, 1.4, 1.5, 2, 2.9]) {
      const rendered = renderCount(grams, CLOVE);
      if (rendered) expect(rendered.count).toBeGreaterThan(0);
    }
  });
});

describe("pluralising the unit noun", () => {
  it("adds an -s by default", () => {
    expect(pluralise("clove")).toBe("cloves");
    expect(pluralise("portion")).toBe("portions");
  });

  it("adds -es after a sibilant", () => {
    expect(pluralise("bunch")).toBe("bunches");
    expect(pluralise("dish")).toBe("dishes");
  });

  /**
   * And takes the library's word for the rest. English pluralisation is not
   * derivable, which is why the irregulars are stored rather than computed —
   * a rule that produces "1 bird's eye chillie" on every recipe is worse than
   * no count at all.
   */
  it("takes an explicit plural over any rule", () => {
    expect(pluralise("leaf", "leaves")).toBe("leaves");
    expect(pluralise("chilli", "chillies")).toBe("chillies");
    expect(pluralise("beetroot", "beetroot")).toBe("beetroot");
    expect(renderCount(5.1, LEAF)?.text).toBe("3 leaves");
  });
});

describe("packets of a reconstituted liquid", () => {
  const SACHET = { unitName: "sachet", perMl: 500 };

  it("counts packets for the volume the recipe asks for", () => {
    expect(renderMadeUp(500, SACHET)?.text).toBe("1 sachet");
    expect(renderMadeUp(900, SACHET)?.text).toBe("2 sachets");
    expect(renderMadeUp(1800, SACHET)?.text).toBe("4 sachets");
  });

  /**
   * The difference from `renderCount`, and the reason the two round
   * differently: a dashi sachet is a sealed teabag. A cabbage can be halved and
   * a sachet cannot, so no output here may carry a fraction.
   */
  it("gives whole packets only", () => {
    for (const ml of [50, 200, 350, 600, 700, 900, 1250, 1800]) {
      const rendered = renderMadeUp(ml, SACHET);
      expect(rendered).not.toBeNull();
      expect(Number.isInteger(rendered?.count)).toBe(true);
      expect(rendered?.text).not.toMatch(/[½¼¾⅓⅔⅛⅜⅝⅞/]/);
    }
  });

  /**
   * A recipe wanting less than a packet's worth still needs a packet. Rounding
   * to zero would be arithmetically closer and would tell a cook to make stock
   * out of nothing — so the floor is one, and the figure says it is a long way
   * from exact.
   */
  it("floors at one packet and admits how far that is from the figure", () => {
    expect(renderMadeUp(200, SACHET)?.text).toBe("1 sachet");
    expect(renderMadeUp(20, SACHET)?.text).toBe("1 sachet");
    expect(renderMadeUp(20, SACHET)?.approximate).toBe(true);
    // A volume that is a whole number of packets is not approximate at all.
    expect(renderMadeUp(500, SACHET)?.approximate).toBe(false);
    expect(renderMadeUp(1000, SACHET)?.approximate).toBe(false);
  });

  it("gives nothing for a volume that is not one", () => {
    expect(renderMadeUp(0, SACHET)).toBeNull();
    expect(renderMadeUp(Number.NaN, SACHET)).toBeNull();
    expect(renderMadeUp(500, { unitName: "cube", perMl: 0 })).toBeNull();
  });
});

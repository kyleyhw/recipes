import { describe, expect, it } from "vitest";
import { placeholderStyle } from "@/lib/photos/placeholder";

/**
 * Tests for the deterministic placeholder.
 *
 * Determinism is the whole point of this module: a recipe must look the same in
 * a listing as on its own page, across reloads, and on every device. A random
 * gradient would make the collection feel unstable and would defeat visual
 * recognition, which is the only thing a placeholder can usefully offer.
 *
 * Determinism is also what makes server rendering safe — a value that differed
 * between server and client would produce a hydration mismatch.
 */

function backgroundOf(seed: string): string {
  const style = placeholderStyle(seed);
  return String(style.backgroundImage ?? "");
}

describe("determinism", () => {
  it("returns the same gradient for the same seed", () => {
    expect(backgroundOf("lemon-cake")).toBe(backgroundOf("lemon-cake"));
  });

  it("returns different gradients for different seeds", () => {
    // Not a guarantee for every possible pair — a 32-bit hash collides
    // eventually — but these particular slugs must be distinguishable.
    const seeds = ["lemon-cake", "roast-squash-soup", "quick-flatbread", "dal"];
    const gradients = new Set(seeds.map(backgroundOf));
    expect(gradients.size).toBe(seeds.length);
  });
});

describe("colour constraints", () => {
  /**
   * Lightness is bounded so the white category glyph always has adequate
   * contrast. An unconstrained hash would occasionally produce a near-white
   * card on which the glyph would be invisible.
   */
  it("keeps lightness inside the legible band for every seed", () => {
    for (let i = 0; i < 2000; i += 1) {
      const gradient = backgroundOf(`recipe-${i}`);
      const lightnesses = [...gradient.matchAll(/oklch\((\d+\.\d+)/g)].map((m) =>
        Number(m[1]),
      );
      expect(lightnesses).toHaveLength(2);
      for (const l of lightnesses) {
        // The second stop is 0.1 darker than the first by construction, so the
        // effective floor is 0.45.
        expect(l).toBeGreaterThanOrEqual(0.45);
        expect(l).toBeLessThanOrEqual(0.68);
      }
    }
  });

  it("keeps chroma muted, below photographic saturation", () => {
    for (let i = 0; i < 2000; i += 1) {
      const gradient = backgroundOf(`recipe-${i}`);
      const chromas = [...gradient.matchAll(/oklch\(\d+\.\d+ (\d+\.\d+)/g)].map((m) =>
        Number(m[1]),
      );
      for (const c of chromas) {
        expect(c).toBeGreaterThanOrEqual(0.06);
        expect(c).toBeLessThanOrEqual(0.12);
      }
    }
  });

  it("keeps hue within the colour circle", () => {
    for (let i = 0; i < 2000; i += 1) {
      const hues = [...backgroundOf(`recipe-${i}`).matchAll(/ (\d+)\)/g)].map((m) =>
        Number(m[1]),
      );
      for (const h of hues) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
    }
  });
});

describe("robustness", () => {
  it("handles an empty seed without producing NaN", () => {
    // FNV-1a over an empty string returns the offset basis, which is valid;
    // the guard is against the arithmetic producing NaN and emitting
    // "oklch(NaN ...)", which browsers drop silently, leaving a transparent box.
    expect(backgroundOf("")).not.toContain("NaN");
  });

  it("handles non-ASCII and very long seeds", () => {
    expect(backgroundOf("crème-brûlée-🍮")).not.toContain("NaN");
    expect(backgroundOf("x".repeat(10_000))).not.toContain("NaN");
  });
});

import type { CSSProperties } from "react";

/**
 * Deterministic placeholder imagery.
 *
 * Layer 4 of the photo strategy: when a recipe has no stored photo — because
 * sourcing failed, or has not run yet, or no blob storage is configured — the
 * card still renders a distinct, stable image rather than an empty box.
 *
 * "Deterministic" is the important property. The gradient is derived from the
 * recipe's slug, so a given recipe always looks the same, in listings and on
 * its own page, across reloads and across devices. A random gradient would make
 * the collection feel unstable and would defeat visual recognition, which is
 * the only thing a placeholder can usefully offer.
 *
 * This module is pure and has no dependencies beyond React's style typing, so
 * it renders identically on the server and the client with no hydration
 * mismatch.
 */

/**
 * FNV-1a, 32-bit.
 *
 * Chosen over a cryptographic hash because the requirement is only uniform
 * spread over a small output space, and over `Math.random` because the result
 * must be stable. The constants are the standard FNV-1a 32-bit offset basis
 * (2166136261) and prime (16777619).
 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // Multiply by the FNV prime using Math.imul to keep 32-bit overflow
    // semantics; a plain `*` would lose precision above 2^53.
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A gradient in oklch, keyed by slug.
 *
 * Hue is free to span the full circle, but chroma and lightness are held in
 * narrow bands so that every placeholder sits in the same tonal family as the
 * warm palette in globals.css. Unconstrained lightness would produce occasional
 * near-white cards on which the white glyph would be invisible, and
 * unconstrained chroma would produce garish outliers next to photographs.
 *
 * The two stops are separated by 40 degrees of hue, enough for a visible
 * gradient without crossing into an unrelated colour.
 */
export function placeholderStyle(seed: string): CSSProperties {
  const h = hash(seed);
  const hue = h % 360;
  // 0.06-0.12: muted, comfortably below the chroma of a real photograph.
  const chroma = 0.06 + ((h >>> 9) % 7) / 100;
  // 0.55-0.68: dark enough for white text at AA contrast, light enough not to
  // read as a hole in the grid.
  const lightness = 0.55 + ((h >>> 17) % 14) / 100;

  const from = `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue})`;
  const to = `oklch(${(lightness - 0.1).toFixed(3)} ${chroma.toFixed(3)} ${(hue + 40) % 360})`;

  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

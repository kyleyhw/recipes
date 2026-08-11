/**
 * Scaling a baking tin with the recipe.
 *
 * Doubling a cake batter into the same tin does not make twice as much cake. It
 * makes a layer twice as deep, and depth is what governs baking: heat reaches
 * the centre by conduction, so a deeper batter needs the outside to sit in the
 * oven far longer before the middle sets. The result is a burnt edge and a raw
 * seam, from a recipe every one of whose quantities was correct.
 *
 * ## The rule
 *
 * A tin holds batter of volume
 *
 *     V = A h
 *
 * over base area A to depth h. Scaling the recipe by alpha gives V' = alpha V.
 * The thing worth holding constant is **depth**, not volume, because depth is
 * what the bake time was chosen for. So
 *
 *     A' = alpha A
 *
 * and every *linear* dimension of the base scales as the square root:
 *
 *     round:   d' = d sqrt(alpha)
 *     square:  s' = s sqrt(alpha)
 *     rect:    l' = l sqrt(alpha),  w' = w sqrt(alpha)
 *
 * A doubled cake therefore wants a tin about 1.41x wider, not 2x. This is the
 * single most useful number here, and the one cooks most often get wrong: the
 * intuition that twice the batter wants twice the tin is wrong by a factor of
 * sqrt(2) in each direction.
 *
 * ## Keeping the tin you own
 *
 * Nobody owns a continuum of tins, so the useful answer is not `d sqrt(alpha)`
 * but the nearest tin that actually exists, together with what that does to the
 * depth. `nearestStandard` supplies it, and `depthFactor` says how much deeper
 * or shallower the layer ends up:
 *
 *     h'/h = alpha A / A_chosen
 *
 * ## What is deliberately not computed
 *
 * The new bake time. Conduction gives a diffusion time going as the square of
 * the depth, but a cake is not a semi-infinite slab: it rises, its thermal
 * properties change as it sets, and the crust insulates. Turning that into a
 * number would be fabricated precision of exactly the kind this application
 * refuses elsewhere. What is given instead is the direction and the reason,
 * and the doneness cue the recipe already states.
 *
 * Pure: no I/O, so every case here is directly testable.
 */

export type TinShape = "round" | "square" | "rectangular" | "loaf";

export interface Tin {
  shape: TinShape;
  /** Centimetres. Round tins only. */
  diameter?: number | undefined;
  /** Centimetres. Square, rectangular and loaf tins. */
  length?: number | undefined;
  /** Centimetres. Rectangular and loaf tins; equals `length` when square. */
  width?: number | undefined;
  /** Centimetres. Optional, and used only to report the resulting depth. */
  depth?: number | undefined;
}

/**
 * Tins people actually own, in centimetres.
 *
 * Drawn from the sizes sold as standard in the UK and US. The point of snapping
 * to this list is that "use a 26.5 cm tin" is not an instruction anybody can
 * follow, whereas "use a 28 cm tin, and the layer will be a fifth shallower" is.
 */
export const STANDARD_ROUND = [15, 18, 20, 23, 25, 28, 30] as const;
export const STANDARD_SQUARE = [15, 18, 20, 23, 25, 28] as const;
/** Loaf tins, by the weight they are sold as: [length, width] in cm. */
export const STANDARD_LOAF: ReadonlyArray<{
  label: string;
  length: number;
  width: number;
}> = [
  { label: "450 g", length: 19, width: 9 },
  { label: "900 g", length: 23, width: 13 },
  { label: "1.2 kg", length: 26, width: 14 },
];

/** Base area in cm², or null when the tin does not state enough to compute it. */
export function tinArea(tin: Tin): number | null {
  if (tin.shape === "round") {
    return tin.diameter && tin.diameter > 0 ? Math.PI * (tin.diameter / 2) ** 2 : null;
  }
  if (tin.shape === "square") {
    const side = tin.length ?? tin.width;
    return side && side > 0 ? side * side : null;
  }
  const length = tin.length;
  const width = tin.width;
  return length && width && length > 0 && width > 0 ? length * width : null;
}

/** Just the dimensions, for phrases that supply their own noun. */
export function describeTinSize(tin: Tin): string {
  if (tin.shape === "round") return `${round1(tin.diameter ?? 0)} cm round`;
  if (tin.shape === "square") return `${round1(tin.length ?? tin.width ?? 0)} cm square`;
  return `${round1(tin.length ?? 0)} × ${round1(tin.width ?? 0)} cm`;
}

/** Formats a tin as a person would say it. */
export function describeTin(tin: Tin): string {
  if (tin.shape === "round") return `${round1(tin.diameter ?? 0)} cm round tin`;
  if (tin.shape === "square")
    return `${round1(tin.length ?? tin.width ?? 0)} cm square tin`;
  const shape = tin.shape === "loaf" ? "loaf tin" : "tin";
  return `${round1(tin.length ?? 0)} × ${round1(tin.width ?? 0)} cm ${shape}`;
}

function round1(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}

/** True when the ideal tin is bigger than anything sold as standard. */
function outgrowsLargest(ideal: Tin): boolean {
  if (ideal.shape === "round") {
    const largest = STANDARD_ROUND[STANDARD_ROUND.length - 1] ?? 0;
    return (ideal.diameter ?? 0) > largest;
  }
  if (ideal.shape === "square") {
    const largest = STANDARD_SQUARE[STANDARD_SQUARE.length - 1] ?? 0;
    return (ideal.length ?? 0) > largest;
  }
  const area = tinArea(ideal);
  const largestArea = Math.max(...STANDARD_LOAF.map((t) => t.length * t.width));
  return area !== null && area > largestArea;
}

function nearest(target: number, options: readonly number[]): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  for (const option of options) {
    const gap = Math.abs(option - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = option;
    }
  }
  return best;
}

export interface TinAdvice {
  /** The tin whose base area is alpha times the original's. */
  ideal: Tin;
  /** The closest tin someone is likely to own. Null when none is close enough. */
  nearest: Tin | null;
  /**
   * Depth of the batter in `nearest`, relative to the original.
   *
   * 1 means the same depth and so the same bake. Above 1 is deeper and needs
   * longer and cooler; below 1 is shallower and needs less time.
   */
  depthFactor: number | null;
  /** The resulting depth in cm, when the original tin stated one. */
  depthCm: number | null;
}

/**
 * Works out what tin a scaled recipe wants.
 *
 * Returns null when the recipe's tin is not specific enough to scale, which is
 * the honest outcome: guessing at a missing dimension would produce a confident
 * instruction resting on nothing.
 */
export function scaleTin(tin: Tin, alpha: number): TinAdvice | null {
  const area = tinArea(tin);
  if (area === null || !Number.isFinite(alpha) || alpha <= 0) return null;

  const linear = Math.sqrt(alpha);
  const targetArea = area * alpha;

  let ideal: Tin;
  let nearestTin: Tin | null = null;

  if (tin.shape === "round") {
    const diameter = (tin.diameter ?? 0) * linear;
    ideal = { shape: "round", diameter };
    const snapped = nearest(diameter, STANDARD_ROUND);
    if (snapped !== null) nearestTin = { shape: "round", diameter: snapped };
  } else if (tin.shape === "square") {
    const side = (tin.length ?? tin.width ?? 0) * linear;
    ideal = { shape: "square", length: side, width: side };
    const snapped = nearest(side, STANDARD_SQUARE);
    if (snapped !== null)
      nearestTin = { shape: "square", length: snapped, width: snapped };
  } else {
    const length = (tin.length ?? 0) * linear;
    const width = (tin.width ?? 0) * linear;
    ideal = { shape: tin.shape, length, width };
    if (tin.shape === "loaf") {
      // Loaf tins are not a continuum in either dimension, so the nearest one
      // is chosen by area rather than by matching both sides — which is what a
      // cook does when they reach for the next tin up.
      let best: (typeof STANDARD_LOAF)[number] | null = null;
      let bestGap = Infinity;
      for (const option of STANDARD_LOAF) {
        const gap = Math.abs(option.length * option.width - targetArea);
        if (gap < bestGap) {
          bestGap = gap;
          best = option;
        }
      }
      if (best) nearestTin = { shape: "loaf", length: best.length, width: best.width };
    }
  }

  const nearestArea = nearestTin ? tinArea(nearestTin) : null;
  const depthFactor = nearestArea && nearestArea > 0 ? targetArea / nearestArea : null;

  return {
    ideal,
    nearest: nearestTin,
    depthFactor,
    depthCm:
      depthFactor !== null && tin.depth
        ? Math.round(tin.depth * depthFactor * 10) / 10
        : null,
  };
}

/**
 * Beyond this much difference in depth, the bake genuinely changes and saying
 * so matters more than the tin recommendation itself.
 *
 * 15% is roughly the point at which a 4 cm layer becomes 4.6 cm — enough that a
 * cake baked to the original time comes out underdone in the middle. Below it,
 * the same time and temperature still work.
 */
export const DEPTH_TOLERANCE = 0.15;

/** A sentence a cook can act on, or null when the tin does not change usefully. */
export function tinAdviceText(tin: Tin, alpha: number): string | null {
  if (Math.abs(alpha - 1) < 1e-9) return null;
  const advice = scaleTin(tin, alpha);
  if (!advice) return null;

  const parts = [`Scaled, this wants a ${describeTin(advice.ideal)}.`];

  if (advice.nearest) {
    const deeper = advice.depthFactor !== null && advice.depthFactor > 1;
    const off = advice.depthFactor !== null ? Math.abs(advice.depthFactor - 1) : 0;

    if (off < DEPTH_TOLERANCE) {
      parts.push(
        `The nearest standard tin is a ${describeTin(advice.nearest)}, which is close enough that the time and temperature stand.`,
      );
    } else if (deeper && outgrowsLargest(advice.ideal)) {
      // The honest answer once a recipe outgrows every tin in the cupboard is
      // not "use your biggest and bake it longer" — a layer 78% deeper does not
      // cook through before its edges burn. It is to bake it in two.
      const tins = Math.ceil(advice.depthFactor ?? 1);
      parts.push(
        `That is larger than any standard tin, so divide the batter between ${tins} × ${describeTinSize(advice.nearest)} tins rather than deepening one — the same depth, the same bake, ${tins} of them.`,
      );
    } else {
      parts.push(
        `In a ${describeTin(advice.nearest)} the batter sits ${Math.round(off * 100)}% ${
          deeper ? "deeper" : "shallower"
        }${advice.depthCm ? ` (about ${advice.depthCm} cm)` : ""}, so it will need ${
          deeper
            ? "longer at a lower temperature — drop the oven by 10 °C and start checking 10 minutes late"
            : "less time — start checking 10 minutes early"
        }.`,
      );
    }
  }

  return parts.join(" ");
}

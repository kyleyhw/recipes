import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata, type Sharp } from "sharp";
import { putImage, type StoredImage } from "@/lib/photos/storage";

/**
 * Fetching, validating, and normalising a recipe photo.
 *
 * Every image entering the application passes through here regardless of its
 * layer — source-page `og:image`, Claude web search, or manual upload — so
 * validation and re-encoding happen exactly once, in one place.
 */

/**
 * Minimum acceptable short edge, in pixels.
 *
 * The hero image renders around 700 CSS px wide; at a 2x device pixel ratio
 * that is 1400 device px, and upscaling anything below roughly 600 px to fill
 * it is visibly soft. Below this threshold a generated placeholder looks better
 * than a real photograph, which is the whole justification for rejecting.
 */
const MIN_SHORT_EDGE = 600;

/**
 * Widest and narrowest acceptable aspect ratios.
 *
 * Food photographs are near-square to 16:9. Anything outside this band is
 * almost always a banner, a logo, a sprite sheet, or a tracking pixel that
 * happened to satisfy the size check.
 */
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.5;

/**
 * Refuse to download more than this. A recipe photo is rarely above 2 MB; a
 * 100 MB TIFF behind a plausible URL would otherwise exhaust memory before the
 * dimension check ever ran.
 */
const MAX_BYTES = 12 * 1024 * 1024;

/** Rendered sizes. The hero is capped at a 2x retina width for its column. */
const HERO_WIDTH = 1400;
const CARD_WIDTH = 640;

/** WebP quality. 82 is the usual knee: artefacts are imperceptible on
 *  photographic content, and the file is roughly a third of the JPEG. */
const WEBP_QUALITY = 82;

export type IngestFailure =
  | "fetch-failed"
  | "not-an-image"
  | "too-large"
  | "too-small"
  | "bad-aspect"
  | "storage-failed";

export type IngestResult =
  | { ok: true; hero: StoredImage; card: StoredImage; width: number; height: number }
  | { ok: false; reason: IngestFailure };

/** Downloads an image, refusing oversized or non-image responses early. */
async function download(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "recipes-app/0.1 (personal recipe collection)" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    // Trust the declared length when present, so an oversized body is rejected
    // before it is buffered rather than after.
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > MAX_BYTES ? null : buffer;
  } catch {
    return null;
  }
}

/**
 * Validates and re-encodes an image, storing a hero and a card rendition.
 *
 * Re-encoding is not merely an optimisation. Decoding with sharp and
 * re-emitting WebP discards any EXIF payload, embedded colour profiles, and
 * whatever else travelled with a file fetched from an arbitrary origin — the
 * stored bytes are ones this application produced.
 */
export async function ingestImageBuffer(source: Buffer): Promise<IngestResult> {
  let pipeline: Sharp;
  let metadata: Metadata;
  try {
    pipeline = sharp(source, { failOn: "error" });
    metadata = await pipeline.metadata();
  } catch {
    return { ok: false, reason: "not-an-image" };
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) return { ok: false, reason: "not-an-image" };

  if (Math.min(width, height) < MIN_SHORT_EDGE) return { ok: false, reason: "too-small" };

  const aspect = width / height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT)
    return { ok: false, reason: "bad-aspect" };

  try {
    // Content-addressed: the same image imported twice reuses one stored
    // object rather than accumulating duplicates.
    const digest = createHash("sha256").update(source).digest("hex").slice(0, 32);

    const [heroBuffer, cardBuffer] = await Promise.all([
      sharp(source)
        .rotate() // apply EXIF orientation before stripping the metadata
        .resize({ width: HERO_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer(),
      sharp(source)
        .rotate()
        .resize({ width: CARD_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer(),
    ]);

    const [hero, card] = await Promise.all([
      putImage(`${digest}-hero.webp`, heroBuffer),
      putImage(`${digest}-card.webp`, cardBuffer),
    ]);

    return { ok: true, hero, card, width, height };
  } catch {
    return { ok: false, reason: "storage-failed" };
  }
}

/** Fetches a remote image and ingests it. */
export async function ingestImageUrl(url: string): Promise<IngestResult> {
  const buffer = await download(url);
  if (!buffer) return { ok: false, reason: "fetch-failed" };
  return ingestImageBuffer(buffer);
}

/** Human-readable explanations, shown when a photo is rejected. */
export const INGEST_FAILURE_MESSAGES: Record<IngestFailure, string> = {
  "fetch-failed": "That image could not be downloaded.",
  "not-an-image": "That file is not an image this application can read.",
  "too-large": "That image is too large.",
  "too-small": `That image is smaller than ${MIN_SHORT_EDGE}px on its short edge, so it would look soft.`,
  "bad-aspect": "That image is too long or too narrow to be a photo of a dish.",
  "storage-failed": "The image could not be stored.",
};

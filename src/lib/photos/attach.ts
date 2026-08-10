import "server-only";
import { Prisma, type PhotoSource } from "@/generated/prisma";
import { db } from "@/lib/db";
import { deleteImage, handleFromUrl } from "@/lib/photos/storage";
import {
  ingestImageBuffer,
  ingestImageUrl,
  type IngestFailure,
} from "@/lib/photos/ingest";

/**
 * Attaching a photo to a recipe.
 *
 * Sits between ingest (which validates and stores bytes) and the database
 * (which records the result), so the replace-and-clean-up sequence is written
 * once rather than in each caller.
 */

export interface PhotoCredit {
  siteName: string | null;
  pageUrl: string | null;
  originalUrl: string;
  fetchedAt: string;
}

async function replacePhoto(
  recipeId: string,
  photoUrl: string,
  source: PhotoSource,
  credit: PhotoCredit | null,
): Promise<void> {
  const existing = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { photoUrl: true },
  });

  await db.recipe.update({
    where: { id: recipeId },
    data: {
      photoUrl,
      photoSource: source,
      // Prisma distinguishes JSON null from SQL NULL; DbNull is the column
      // being empty, which is what "no attribution" means here.
      photoCredit: credit ? { ...credit } : Prisma.DbNull,
    },
  });

  // Delete the old image only after the new one is recorded. The reverse order
  // would leave a recipe pointing at a deleted object if the update failed.
  if (existing?.photoUrl && existing.photoUrl !== photoUrl) {
    await deleteImage(handleFromUrl(existing.photoUrl));
  }
}

/**
 * Layer 1 — the source page's own image.
 *
 * Free, needs no model call, and is reliably a photograph of the exact dish,
 * because it is the image the site chose to represent that recipe. This runs on
 * every URL import and succeeds for most of them.
 */
export async function attachPhotoFromSourcePage(
  recipeId: string,
  imageUrl: string,
  pageUrl: string,
): Promise<IngestFailure | null> {
  const result = await ingestImageUrl(imageUrl);
  if (!result.ok) return result.reason;

  let siteName: string | null = null;
  try {
    siteName = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    // A malformed page URL costs the attribution label, not the photo.
  }

  await replacePhoto(recipeId, result.hero.url, "SOURCE_PAGE", {
    siteName,
    pageUrl,
    originalUrl: imageUrl,
    fetchedAt: new Date().toISOString(),
  });
  return null;
}

/** A photograph proposed by Claude's web search (`lib/ai/photo.ts`). */
export interface WebPhotoCandidate {
  imageUrl: string;
  pageUrl: string;
  siteName: string;
  why: string;
}

export interface WebSearchPhotoOutcome {
  /** The candidate actually attached, or null if every one failed validation. */
  attached: WebPhotoCandidate | null;
  /** Why each rejected candidate was rejected, in the order tried. */
  rejected: Array<{ candidate: WebPhotoCandidate; reason: IngestFailure }>;
}

/**
 * Layer 2 — a photograph found by Claude's web search.
 *
 * Candidates are tried in order until one survives ingest, which is a real
 * filter: a search result may be unreachable, may not decode, may be a 200 px
 * thumbnail, or may be a banner. Trying only the first would waste the search
 * whenever the best-described candidate happens to be the least usable file.
 *
 * The unused candidates are kept on the recipe. Replacing a photo afterwards is
 * then free, where re-running the search would cost another billable call for a
 * result already paid for.
 */
export async function attachPhotoFromWebSearch(
  recipeId: string,
  candidates: readonly WebPhotoCandidate[],
): Promise<WebSearchPhotoOutcome> {
  const rejected: WebSearchPhotoOutcome["rejected"] = [];

  for (const [index, candidate] of candidates.entries()) {
    const result = await ingestImageUrl(candidate.imageUrl);
    if (!result.ok) {
      rejected.push({ candidate, reason: result.reason });
      continue;
    }

    await replacePhoto(recipeId, result.hero.url, "WEB_SEARCH", {
      siteName: candidate.siteName || null,
      pageUrl: candidate.pageUrl || null,
      originalUrl: candidate.imageUrl,
      fetchedAt: new Date().toISOString(),
    });

    const remaining = candidates.slice(index + 1);
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        // Spread into object literals rather than passed through: Prisma's JSON
        // input type requires an index signature, which a declared interface
        // does not have and an anonymous object literal does.
        photoCandidates:
          remaining.length > 0
            ? remaining.map((c) => ({
                imageUrl: c.imageUrl,
                pageUrl: c.pageUrl,
                siteName: c.siteName,
                why: c.why,
              }))
            : Prisma.DbNull,
      },
    });

    return { attached: candidate, rejected };
  }

  return { attached: null, rejected };
}

/**
 * Layer 3 — manual upload.
 *
 * Always wins over an automatic result, and carries no credit: it is the
 * owner's own photograph of the dish as actually cooked.
 */
export async function attachUploadedPhoto(
  recipeId: string,
  data: Buffer,
): Promise<IngestFailure | null> {
  const result = await ingestImageBuffer(data);
  if (!result.ok) return result.reason;
  await replacePhoto(recipeId, result.hero.url, "UPLOAD", null);
  return null;
}

/**
 * Clears the photo, returning the recipe to its generated placeholder.
 *
 * The placeholder is deterministic, so clearing is never destructive in the way
 * that leaving an empty slot would be — the card still renders.
 */
export async function clearPhoto(recipeId: string): Promise<void> {
  const existing = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { photoUrl: true },
  });
  await db.recipe.update({
    where: { id: recipeId },
    data: {
      photoUrl: null,
      photoSource: null,
      photoCredit: Prisma.DbNull,
      photoCandidates: Prisma.DbNull,
    },
  });
  if (existing?.photoUrl) await deleteImage(handleFromUrl(existing.photoUrl));
}

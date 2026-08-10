import "server-only";
import { callWithTool, type AiFailure } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/pricing";
import { photoCandidatesSchema } from "@/lib/ai/schemas";
import {
  attachPhotoFromWebSearch,
  type WebPhotoCandidate,
  type WebSearchPhotoOutcome,
} from "@/lib/photos/attach";

/**
 * Photo layer 2 — finding a photograph by web search.
 *
 * Layer 1 (the source page's own `og:image`) covers most imported recipes for
 * nothing, and layer 4 (the deterministic placeholder) guarantees no blank
 * card. This layer exists for the case in between: a recipe typed by hand or
 * written by Claude, which has no source page to borrow an image from.
 *
 * ## Why this is the most expensive call in the application
 *
 * Server-side web search is billed per search — $10 per 1,000 — which at one or
 * two searches dominates the token cost of the call. `MAX_SEARCHES` is
 * therefore low and deliberate: this is a search for a photograph of a known
 * dish, not an investigation.
 *
 * ## Why several candidates
 *
 * The returned URLs are not trusted. Each is fetched, decoded, and measured
 * against the same thresholds every other photo passes (`lib/photos/ingest.ts`)
 * before it is used, and search results fail that often enough — dead links,
 * thumbnails, banners — that asking for one candidate would waste the search.
 * The runners-up are stored, so a replacement later costs nothing.
 */

/**
 * Searches allowed per photo request.
 *
 * Two: one query, and one chance to reformulate if the first returns nothing
 * usable. A third would be paying to search for a dish the web does not have a
 * photograph of, which no number of queries fixes.
 */
const MAX_SEARCHES = 2;

export type PhotoSourcingResult =
  ({ ok: true; costUsd: number } & WebSearchPhotoOutcome) | AiFailure;

export interface PhotoSubject {
  title: string;
  description: string | null;
  /** A search phrase, when generation has already supplied one. */
  query: string | null;
}

export async function sourcePhotoByWebSearch(
  recipeId: string,
  subject: PhotoSubject,
): Promise<PhotoSourcingResult> {
  const result = await callWithTool({
    kind: "PHOTO",
    recipeId,
    system: [
      "You find photographs of finished dishes for a personal recipe collection.",
      "",
      "Search the web for photographs of the dish described, then record the best",
      "candidates you found.",
      "",
      "What counts as a usable candidate:",
      "- A photograph of the finished, plated dish. Not ingredients, not a",
      "  step-by-step collage, not an illustration, not a stock-photo watermark,",
      "  not an image with recipe text laid over it.",
      "- A direct URL to the image file — one ending in .jpg, .jpeg, .png, or",
      "  .webp. A link to the page containing the image is useless here.",
      "- Large. These are displayed as a full-width photograph on a phone, so a",
      "  thumbnail is worse than no photograph at all.",
      "",
      "Give several candidates in order of confidence. Every one you give will be",
      "downloaded and checked, so a candidate you are unsure about is still worth",
      "listing below one you are sure of — but do not list an image of a different",
      "dish just to fill the list.",
    ].join("\n"),
    prompt: [
      `Dish: ${subject.title}`,
      subject.description ? `Description: ${subject.description}` : null,
      subject.query ? `Suggested search: ${subject.query}` : null,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    tool: {
      name: "record_photo_candidates",
      description:
        "Record the photographs you found. Call this once, after searching, with your candidates in order.",
      schema: photoCandidatesSchema,
    },
    webSearch: { maxUses: MAX_SEARCHES },
    // Judging whether a search result depicts the right dish is a recognition
    // task, not a reasoning one, and the search itself is the expensive part.
    model: MODELS.cheap,
    effort: "low",
  });

  if (!result.ok) return result;

  const candidates: WebPhotoCandidate[] = result.data.candidates
    .filter((candidate) => isHttpUrl(candidate.imageUrl))
    .map((candidate) => ({
      imageUrl: candidate.imageUrl,
      pageUrl: candidate.pageUrl,
      siteName: candidate.siteName,
      why: candidate.why,
    }));

  const outcome = await attachPhotoFromWebSearch(recipeId, candidates);
  return { ok: true, costUsd: result.costUsd, ...outcome };
}

/**
 * Guards the URL before it reaches the fetcher.
 *
 * The model's answer is validated for shape by the schema, which cannot express
 * "is a URL this application should fetch". Restricting to http(s) here keeps a
 * `file:` or `data:` URL from turning the photo fetcher into a reader of the
 * server's own filesystem.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

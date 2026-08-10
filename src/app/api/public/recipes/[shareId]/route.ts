import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRecipeBySlug } from "@/lib/recipes";
import { toBundle } from "@/lib/sharing/exchange";

/**
 * Public bundle endpoint.
 *
 *   GET /api/public/recipes/<shareId>
 *
 * Unauthenticated by design — this is how another instance fetches a shared
 * recipe. It is one of the three prefixes the session gate lets through.
 *
 * Only recipes with a non-null shareId are reachable, and the id is 128 bits of
 * randomness, so the surface is exactly the set of recipes the owner chose to
 * share. Revoking sharing nulls the id and this returns 404 immediately.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;

  const found = await db.recipe.findUnique({
    where: { shareId },
    select: { slug: true },
  });
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recipe = await getRecipeBySlug(found.slug);
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(toBundle(recipe), {
    headers: {
      // CORS: another instance fetches this from its own origin. Read-only and
      // already public, so a wildcard origin exposes nothing further.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      // Unsharing must take effect immediately, so this is never cached.
      "Cache-Control": "no-store",
    },
  });
}

/** Preflight, for cross-origin fetches that set an Accept header. */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getRecipeBySlug } from "@/lib/recipes";
import { nutritionFor } from "@/lib/nutrition/recipe-nutrition";
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_FORMATS,
  toCsv,
  toJson,
  toJsonLd,
  toTrackerText,
  type ExportFormat,
} from "@/lib/export/formats";

/**
 * Recipe export.
 *
 *   GET /api/recipes/<slug>/export/<format>?servings=N
 *
 * The id segment accepts a slug, since that is what the pages already have and
 * what a person would type. `servings` defaults to the recipe's base.
 *
 * Behind the session gate: `/api/*` is not in the proxy's public list, so this
 * is the owner's own export surface. The public, unauthenticated equivalent for
 * shared recipes is `/api/public/*` (phase 6).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;

  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json(
      { error: `Unknown format. Supported: ${EXPORT_FORMATS.join(", ")}` },
      { status: 400 },
    );
  }

  // Accept either a slug or an id, so the endpoint is usable from a URL bar and
  // from code that only holds the primary key.
  const recipe =
    (await getRecipeBySlug(id)) ??
    (await db.recipe
      .findUnique({ where: { id }, select: { slug: true } })
      .then((r) => (r ? getRecipeBySlug(r.slug) : null)));

  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requested = Number.parseFloat(request.nextUrl.searchParams.get("servings") ?? "");
  const servings =
    Number.isFinite(requested) && requested > 0 ? requested : recipe.baseServings;

  const nutrition = nutritionFor(recipe, servings);

  let body: string;
  switch (format as ExportFormat) {
    case "json":
      body = JSON.stringify(toJson(recipe, nutrition, servings), null, 2);
      break;
    case "json-ld":
      body = JSON.stringify(toJsonLd(recipe, nutrition, servings, appUrl()), null, 2);
      break;
    case "csv":
      body = toCsv(recipe, nutrition);
      break;
    case "text":
      body = toTrackerText(recipe, nutrition, servings);
      break;
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPES[format as ExportFormat],
      // Exports are a snapshot of mutable data; caching them would serve stale
      // macros after an ingredient correction.
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getRecipeBySlug } from "@/lib/recipes";
import { nutritionFor } from "@/lib/nutrition/recipe-nutrition";
import { toJson } from "@/lib/export/formats";

/**
 * The canonical machine format for one recipe.
 *
 *   GET /api/recipes/<slug>?servings=N
 *
 * Equivalent to the `json` export; this shorter path exists because it is the
 * one a person would guess.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const recipe =
    (await getRecipeBySlug(id)) ??
    (await db.recipe
      .findUnique({ where: { id }, select: { slug: true } })
      .then((r) => (r ? getRecipeBySlug(r.slug) : null)));

  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requested = Number.parseFloat(request.nextUrl.searchParams.get("servings") ?? "");
  const servings =
    Number.isFinite(requested) && requested > 0 ? requested : recipe.baseServings;

  return NextResponse.json(toJson(recipe, nutritionFor(recipe, servings), servings), {
    headers: { "Cache-Control": "no-store" },
  });
}

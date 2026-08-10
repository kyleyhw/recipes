import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getRecipeBySlug } from "@/lib/recipes";
import { BUNDLE_VERSION } from "@/lib/sharing/bundle";
import { toBundle } from "@/lib/sharing/exchange";

/**
 * Whole-collection export.
 *
 *   GET /api/collection
 *
 * Behind the session gate: this is the owner's entire collection, not a share.
 *
 * Exists because the application holds data that exists nowhere else. A recipe
 * typed here and never written down elsewhere is lost with the database, so a
 * single-file backup that the import path can read back is not a luxury.
 */
export async function GET() {
  const recipes = await db.recipe.findMany({
    orderBy: { title: "asc" },
    select: { slug: true },
  });

  // Sequentially rather than in parallel: a large collection would otherwise
  // open one connection per recipe and exhaust the pool.
  const bundles = [];
  for (const { slug } of recipes) {
    const recipe = await getRecipeBySlug(slug);
    if (recipe) bundles.push(toBundle(recipe));
  }

  const body = JSON.stringify(
    {
      schema: "recipes.collection",
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      instanceUrl: appUrl(),
      recipes: bundles,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="recipes-collection.json"`,
      "Cache-Control": "no-store",
    },
  });
}

import { loadCollection } from "@/lib/content/library";
import { prepareRecipe } from "@/lib/content/prepare";
import { computeNutrition } from "@/lib/nutrition/compute";
import {
  toCsv,
  toJson,
  toJsonLd,
  toTrackerText,
  type ExportRecipe,
} from "@/lib/export/formats";

/**
 * Exports, generated as files at build time.
 *
 * The application computes macros so a tracker can consume them, so export is a
 * primary interface rather than an afterthought. A static export supports Route
 * Handlers only for `GET` and only without reading the request, which is enough
 * here: each of these becomes a real file in `out/`, addressable by a script,
 * a spreadsheet, or a tracker's importer.
 *
 * **One regression from the server build, stated plainly:** the old endpoints
 * honoured `?servings=N`, so what you exported was what was on screen. A static
 * file cannot vary by query string. These are all at the recipe's own serving
 * count, and per-serving macros are invariant under scaling anyway — so the
 * figures a tracker cares about are unaffected; only the total quantities
 * differ from a scaled view.
 */

const FORMATS = ["json", "jsonld", "csv", "txt"] as const;
type Format = (typeof FORMATS)[number];

export function generateStaticParams(): Array<{ slug: string; format: string }> {
  return loadCollection().recipes.flatMap((recipe) =>
    FORMATS.map((format) => ({ slug: recipe.slug, format })),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; format: string }> },
): Promise<Response> {
  const { slug, format } = await params;
  const { recipes, ingredients, attribution } = loadCollection();
  const recipe = recipes.find((entry) => entry.slug === slug);
  if (!recipe) return new Response("Not found", { status: 404 });
  const credit = attribution[slug];

  const prepared = prepareRecipe(recipe, ingredients);
  const nutrition = computeNutrition(prepared.nutrition, recipe.servings);

  const exportable: ExportRecipe = {
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    category: recipe.category,
    tags: recipe.tags,
    servings: recipe.servings,
    servingLabel: recipe.servingLabel,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    source: recipe.source,
    photo: recipe.photo,
    ingredients: prepared.scalable,
    steps: recipe.steps,
    author: credit
      ? {
          name: credit.addedBy.name,
          url: credit.addedBy.handle
            ? `https://github.com/${credit.addedBy.handle}`
            : null,
        }
      : null,
  };

  switch (format as Format) {
    case "json":
      return Response.json(toJson(exportable, nutrition, recipe.servings));
    case "jsonld":
      return Response.json(toJsonLd(exportable, nutrition, recipe.servings, null));
    case "csv":
      return new Response(toCsv(exportable, nutrition), {
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
    case "txt":
      return new Response(toTrackerText(exportable, nutrition, recipe.servings), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    default:
      return new Response("Unknown format", { status: 404 });
  }
}

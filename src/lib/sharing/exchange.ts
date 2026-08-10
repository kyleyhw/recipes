import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { slugify, uniqueSlug, type FullRecipe } from "@/lib/recipes";
import {
  BUNDLE_VERSION,
  parseBundle,
  type Bundle,
  type BundleIngredient,
} from "@/lib/sharing/bundle";

/**
 * Serialising recipes out of, and back into, the database.
 *
 * The pure format lives in `bundle.ts`; this module is the database half.
 */

/** Serialises a recipe into a portable bundle. */
export function toBundle(recipe: FullRecipe): Bundle {
  return {
    schema: "recipes.bundle",
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    instanceUrl: appUrl(),
    shareId: recipe.shareId,
    recipe: {
      title: recipe.title,
      description: recipe.description,
      categoryName: recipe.category.name,
      tagNames: recipe.tags.map((t) => t.name),
      baseServings: recipe.baseServings,
      servingLabel: recipe.servingLabel,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      sourceUrl: recipe.sourceUrl,
      notes: recipe.notes,
      // Absolute, so the importing instance can fetch it. A relative path would
      // resolve against the wrong origin.
      photoUrl:
        recipe.photoUrl && !recipe.photoUrl.startsWith("http")
          ? `${appUrl() ?? ""}${recipe.photoUrl}`
          : recipe.photoUrl,
      photoCredit: recipe.photoCredit,
      ingredients: recipe.ingredients.map((row) => ({
        rawText: row.rawText,
        quantity: row.quantity,
        unit: row.unit,
        name: row.name,
        prepNote: row.prepNote,
        optional: row.optional,
        scalable: row.scalable,
        gramsOverride: row.gramsOverride,
        ingredientName: row.ingredient?.name ?? null,
        // The macro snapshot is what lets the importing instance show correct
        // nutrition with no USDA key and no lookup.
        macro: row.ingredient
          ? {
              kcal100g: row.ingredient.kcal100g,
              protein100g: row.ingredient.protein100g,
              carbs100g: row.ingredient.carbs100g,
              fat100g: row.ingredient.fat100g,
              fiber100g: row.ingredient.fiber100g,
              sugar100g: row.ingredient.sugar100g,
              sodiumMg100g: row.ingredient.sodiumMg100g,
              densityGPerMl: row.ingredient.densityGPerMl,
              gramsPerUnit: row.ingredient.gramsPerUnit,
              usdaFdcId: row.ingredient.usdaFdcId,
              sourceNote: row.ingredient.sourceNote,
            }
          : null,
      })),
      steps: recipe.steps.map((s) => s.text),
    },
  };
}

/**
 * Mints a share id, or returns the existing one.
 *
 * 16 random bytes as base64url: 128 bits, so the id is unguessable and the
 * public page cannot be found by enumeration. It is separate from the recipe's
 * primary key so that sharing one recipe never exposes an internal identifier
 * that could be used to probe for others.
 */
export async function shareRecipe(recipeId: string): Promise<string> {
  const existing = await db.recipe.findUnique({
    where: { id: recipeId },
    select: { shareId: true },
  });
  if (existing?.shareId) return existing.shareId;

  const shareId = randomBytes(16).toString("base64url");
  await db.recipe.update({
    where: { id: recipeId },
    data: { shareId, sharedAt: new Date() },
  });
  return shareId;
}

/** Revokes sharing. Any circulated link stops working immediately. */
export async function unshareRecipe(recipeId: string): Promise<void> {
  await db.recipe.update({
    where: { id: recipeId },
    data: { shareId: null, sharedAt: null },
  });
}

/**
 * Resolves a bundle's ingredient to a local canonical `Ingredient`.
 *
 * Matching order — USDA id, then name — is what makes an imported recipe share
 * the local library rather than duplicating it. Matching on the USDA identifier
 * first is the stronger signal: two instances may spell an ingredient
 * differently while referring to the same FDC record.
 *
 * A local row is never overwritten. The importing instance's data, and in
 * particular any manual correction it holds, outranks a visitor's snapshot.
 */
async function resolveBundleIngredient(
  ingredient: BundleIngredient,
): Promise<string | null> {
  if (!ingredient.macro || !ingredient.ingredientName) return null;

  if (ingredient.macro.usdaFdcId) {
    const byUsda = await db.ingredient.findFirst({
      where: { usdaFdcId: ingredient.macro.usdaFdcId },
      select: { id: true },
    });
    if (byUsda) return byUsda.id;
  }

  const byName = await db.ingredient.findFirst({
    where: { name: { equals: ingredient.ingredientName, mode: "insensitive" } },
    select: { id: true },
  });
  if (byName) return byName.id;

  // Genuinely new to this instance: adopt the snapshot.
  const created = await db.ingredient.create({
    data: {
      name: ingredient.ingredientName,
      usdaFdcId: ingredient.macro.usdaFdcId,
      kcal100g: ingredient.macro.kcal100g,
      protein100g: ingredient.macro.protein100g,
      carbs100g: ingredient.macro.carbs100g,
      fat100g: ingredient.macro.fat100g,
      fiber100g: ingredient.macro.fiber100g,
      sugar100g: ingredient.macro.sugar100g,
      sodiumMg100g: ingredient.macro.sodiumMg100g,
      densityGPerMl: ingredient.macro.densityGPerMl,
      gramsPerUnit: ingredient.macro.gramsPerUnit,
      source: "USDA",
      sourceNote: ingredient.macro.sourceNote ?? "Imported with a shared recipe",
    },
    select: { id: true },
  });
  return created.id;
}

export interface ImportOutcome {
  slug: string;
  title: string;
  /** Ingredients matched to the local library or created from the snapshot. */
  resolvedCount: number;
  totalIngredients: number;
}

/**
 * Writes a bundle into this instance as a new recipe.
 *
 * Imported recipes are saved as `DRAFT`: they came from someone else's kitchen
 * and have not been cooked here yet, and the category may not map onto how this
 * collection is organised.
 */
export async function importBundle(bundle: Bundle): Promise<ImportOutcome> {
  const { recipe } = bundle;

  // Categories travel as names. An unrecognised one is created rather than
  // silently collapsed into a default, which would lose the sender's intent.
  const category = await db.category.upsert({
    where: { slug: slugify(recipe.categoryName) },
    update: {},
    create: {
      name: recipe.categoryName,
      slug: slugify(recipe.categoryName),
      position: 999,
    },
    select: { id: true },
  });

  const tagIds: string[] = [];
  for (const name of recipe.tagNames) {
    const tag = await db.tag.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
      select: { id: true },
    });
    tagIds.push(tag.id);
  }

  const ingredientIds: Array<string | null> = [];
  for (const ingredient of recipe.ingredients) {
    ingredientIds.push(await resolveBundleIngredient(ingredient));
  }

  const slug = await uniqueSlug(recipe.title);

  await db.recipe.create({
    data: {
      slug,
      title: recipe.title,
      description: recipe.description,
      categoryId: category.id,
      baseServings: recipe.baseServings,
      servingLabel: recipe.servingLabel,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      sourceUrl: recipe.sourceUrl,
      notes: recipe.notes,
      status: "DRAFT",
      importedFrom: {
        instanceUrl: bundle.instanceUrl,
        shareId: bundle.shareId,
        title: recipe.title,
        importedAt: new Date().toISOString(),
      },
      tags: { connect: tagIds.map((id) => ({ id })) },
      ingredients: {
        create: recipe.ingredients.map((row, index) => ({
          position: index,
          rawText: row.rawText,
          quantity: row.quantity,
          unit: row.unit,
          name: row.name,
          prepNote: row.prepNote,
          optional: row.optional,
          scalable: row.scalable,
          gramsOverride: row.gramsOverride,
          ingredientId: ingredientIds[index] ?? null,
        })),
      },
      steps: {
        create: recipe.steps.map((text, position) => ({ position, text })),
      },
    },
  });

  return {
    slug,
    title: recipe.title,
    resolvedCount: ingredientIds.filter(Boolean).length,
    totalIngredients: recipe.ingredients.length,
  };
}

/**
 * Fetches a bundle from another instance's public endpoint.
 *
 * Accepts either a share page URL (`/r/<id>`) or the API URL directly, since a
 * person copying a link will have the former.
 */
export async function fetchBundleFromUrl(
  input: string,
): Promise<{ ok: true; bundle: Bundle } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "That does not look like a web address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https addresses can be imported." };
  }

  // Translate a share page URL into its API equivalent.
  const shareMatch = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  if (shareMatch) url.pathname = `/api/public/recipes/${shareMatch[1]}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 404
            ? "That share link is no longer valid — the recipe may have been unshared."
            : `The other instance returned ${response.status}.`,
      };
    }
    return parseBundle(await response.json());
  } catch {
    return { ok: false, error: "Could not reach that address." };
  }
}

import { z } from "zod";

/**
 * The portable recipe bundle.
 *
 * Instances of this application are independent deployments with no shared
 * storage, so sharing cannot be a database-level mechanism. A bundle is a
 * self-contained JSON document that one instance emits and another consumes.
 *
 * Two decisions shape the format:
 *
 * **Resolutions travel with the recipe.** Each ingredient carries its resolved
 * USDA identifier and a snapshot of its per-100 g macros. The importing
 * instance therefore has correct nutrition *immediately*, with no USDA key, no
 * network call, and no model call. Sending only the ingredient text would make
 * every import a re-resolution, and would give different answers on different
 * instances.
 *
 * **Names, not identifiers.** Categories and tags travel as names, because the
 * receiving instance's ids are its own. Anything else would be meaningless
 * across a boundary.
 *
 * This module is pure — serialise, parse, validate, migrate — so it is directly
 * testable and can be used on either side of the exchange.
 */

/**
 * Schema version.
 *
 * Bumped whenever the shape changes in a way older readers cannot ignore.
 * `migrateBundle` upgrades older documents, so a bundle downloaded today still
 * imports after the application has moved on. Shares that break on an upgrade
 * would make the file-download path useless as a backup.
 */
export const BUNDLE_VERSION = 1;

const macroSnapshotSchema = z.object({
  kcal100g: z.number(),
  protein100g: z.number(),
  carbs100g: z.number(),
  fat100g: z.number(),
  fiber100g: z.number().nullable(),
  sugar100g: z.number().nullable(),
  sodiumMg100g: z.number().nullable(),
  densityGPerMl: z.number().nullable(),
  gramsPerUnit: z.number().nullable(),
  usdaFdcId: z.string().nullable(),
  sourceNote: z.string().nullable(),
});

const bundleIngredientSchema = z.object({
  rawText: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  name: z.string(),
  prepNote: z.string().nullable(),
  optional: z.boolean(),
  scalable: z.boolean(),
  gramsOverride: z.number().nullable(),
  /** The canonical ingredient's name, which is how the importer matches it. */
  ingredientName: z.string().nullable(),
  /** Null when the source instance had not resolved this ingredient either. */
  macro: macroSnapshotSchema.nullable(),
});

/**
 * `.passthrough()` is deliberate: a bundle from a *newer* instance may carry
 * fields this version does not know about, and dropping them is better than
 * refusing the import. Unknown fields are ignored on the way in.
 */
export const bundleSchema = z
  .object({
    schema: z.literal("recipes.bundle"),
    version: z.number().int().positive(),
    exportedAt: z.string(),
    /** Origin of the exporting instance, for attribution. Null when unknown. */
    instanceUrl: z.string().nullable(),
    /** The share id at the source, so an importer can link back. */
    shareId: z.string().nullable(),

    recipe: z.object({
      title: z.string(),
      description: z.string().nullable(),
      categoryName: z.string(),
      tagNames: z.array(z.string()),
      baseServings: z.number().positive(),
      servingLabel: z.string(),
      prepMinutes: z.number().int().nullable(),
      cookMinutes: z.number().int().nullable(),
      sourceUrl: z.string().nullable(),
      notes: z.string().nullable(),
      photoUrl: z.string().nullable(),
      photoCredit: z.unknown().nullable(),
      ingredients: z.array(bundleIngredientSchema),
      steps: z.array(z.string()),
    }),
  })
  .passthrough();

export type Bundle = z.infer<typeof bundleSchema>;
export type BundleIngredient = z.infer<typeof bundleIngredientSchema>;

/** A whole-collection export: many bundles in one document. */
export const collectionSchema = z
  .object({
    schema: z.literal("recipes.collection"),
    version: z.number().int().positive(),
    exportedAt: z.string(),
    instanceUrl: z.string().nullable(),
    recipes: z.array(bundleSchema),
  })
  .passthrough();

export type Collection = z.infer<typeof collectionSchema>;

/**
 * Upgrades an older bundle to the current version.
 *
 * There is only one version so far, so this is a pass-through — but it exists
 * now, and is tested now, because the alternative is discovering at version 2
 * that no upgrade path was ever designed and every circulated bundle is dead.
 *
 * A bundle from a *newer* version is returned unchanged rather than rejected:
 * `.passthrough()` keeps its unknown fields, the known fields still validate,
 * and refusing would be worse than importing what we understand.
 */
export function migrateBundle(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  const version = typeof record["version"] === "number" ? record["version"] : 0;

  if (version >= BUNDLE_VERSION) return input;

  // Future migrations chain here:
  //   if (version < 2) { ...transform...; version = 2 }
  return input;
}

export type ParseResult = { ok: true; bundle: Bundle } | { ok: false; error: string };

/**
 * Parses and validates a bundle from arbitrary input.
 *
 * Never throws: malformed input is a routine occurrence (a truncated download,
 * a pasted fragment, the wrong file entirely) and must produce a message the
 * user can act on rather than an error page.
 */
export function parseBundle(input: unknown): ParseResult {
  const migrated = migrateBundle(input);
  const parsed = bundleSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first
        ? `Not a valid recipe bundle: ${first.path.join(".") || "document"} ${first.message.toLowerCase()}`
        : "Not a valid recipe bundle.",
    };
  }
  return { ok: true, bundle: parsed.data };
}

export function parseCollection(
  input: unknown,
): { ok: true; collection: Collection } | { ok: false; error: string } {
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first
        ? `Not a valid collection export: ${first.path.join(".") || "document"} ${first.message.toLowerCase()}`
        : "Not a valid collection export.",
    };
  }
  return { ok: true, collection: parsed.data };
}

/** Filename for a downloaded bundle. */
export function bundleFilename(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "recipe";
  return `${base}.recipe.json`;
}

import "server-only";
import type { RecipeStatus } from "@/generated/prisma";
import type { RecipeInput } from "@/lib/recipes";

/**
 * Reading a recipe editor submission out of a FormData.
 *
 * FormData values are `string | File`, so every field needs narrowing before
 * use. Centralising that here keeps the Server Actions to their actual work and
 * means the empty-string-versus-null decision is made once: an untouched
 * optional input submits `""`, which must become SQL NULL rather than an empty
 * string, or "no source URL" and "a source URL that is the empty string" become
 * indistinguishable in the data.
 */

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function optionalInt(formData: FormData, key: string): number | null {
  const value = text(formData, key);
  if (value.length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const RECIPE_STATUSES = ["DRAFT", "SAVED", "ARCHIVED"] as const;

function status(formData: FormData): RecipeStatus {
  const value = text(formData, "status");
  return (RECIPE_STATUSES as readonly string[]).includes(value)
    ? (value as RecipeStatus)
    : "SAVED";
}

export function readRecipeInput(formData: FormData): RecipeInput {
  const servingsRaw = Number.parseFloat(text(formData, "baseServings"));
  return {
    title: text(formData, "title") || "Untitled",
    description: optionalText(formData, "description"),
    categoryId: text(formData, "categoryId"),
    // A non-positive serving count would make the scaling factor
    // alpha = target/base undefined or negative. Falling back to 1 keeps the
    // recipe usable; the field is required in the form, so this is a guard
    // against a hand-crafted submission rather than an expected path.
    baseServings: Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : 1,
    servingLabel: text(formData, "servingLabel") || "serving",
    prepMinutes: optionalInt(formData, "prepMinutes"),
    cookMinutes: optionalInt(formData, "cookMinutes"),
    sourceUrl: optionalText(formData, "sourceUrl"),
    notes: optionalText(formData, "notes"),
    status: status(formData),
    ingredientsText: text(formData, "ingredientsText"),
    stepsText: text(formData, "stepsText"),
    tagsText: text(formData, "tagsText"),
  };
}

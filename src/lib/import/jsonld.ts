import * as cheerio from "cheerio";
import { z } from "zod";

/**
 * Recipe import from a URL, via schema.org structured data.
 *
 * Most recipe sites publish a `Recipe` object as JSON-LD in order to appear as
 * a rich result in search engines. Reading it is deterministic, free, instant,
 * and more accurate than parsing the rendered prose — the site has already done
 * the structuring. This runs before any model call, and handles the large
 * majority of URL imports on its own.
 *
 * Claude (phase 7) is the fallback for pages with no structured data and for
 * pasted unstructured text.
 *
 * This module is pure apart from the caller-supplied HTML string, so it is
 * testable against fixtures with no network access.
 */

export interface ImportedRecipe {
  title: string;
  description: string | null;
  /** One ingredient per line, ready for the editor's textarea. */
  ingredientsText: string;
  /** One step per line. */
  stepsText: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** og:image or the schema.org image, for photo layer 1. */
  imageUrl: string | null;
  sourceUrl: string | null;
}

/**
 * schema.org permits almost every field to be a string, an object, or an array
 * of either, so the schema is deliberately permissive and the narrowing happens
 * in the readers below. Rejecting a page for an unexpected shape would fail on
 * a large fraction of real sites.
 */
const jsonValue: z.ZodType<unknown> = z.unknown();

/** `"PT1H30M"` -> 90. Returns null for absent or unparseable input. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  // Only the time component matters for cooking; a recipe with a day component
  // (curing, fermenting) is recorded but converted through consistently.
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const total = days * 1440 + hours * 60 + minutes;
  return total > 0 ? total : null;
}

/** Extracts the first plain string from schema.org's string | object | array. */
function readString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readString(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Common wrappers: { "@value": ... }, { "text": ... }, { "url": ... }
    return readString(record["@value"] ?? record["text"] ?? record["url"] ?? null);
  }
  return null;
}

/** Flattens `recipeInstructions`, which may nest HowToSection > HowToStep. */
function readInstructions(value: unknown): string[] {
  if (typeof value === "string") {
    // Some sites emit one HTML blob. Split on tags and sentence-ending
    // newlines rather than on periods, which would shatter "180 C." and
    // "1 lb.".
    return cheerio
      .load(`<div>${value}</div>`)("div")
      .text()
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (Array.isArray(value)) return value.flatMap(readInstructions);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A HowToSection carries its steps in itemListElement.
    if (record["itemListElement"]) return readInstructions(record["itemListElement"]);
    const text = readString(record["text"] ?? record["name"]);
    return text ? [text] : [];
  }
  return [];
}

/** `"4 servings"` -> 4; `["4"]` -> 4; `4` -> 4. */
function readServings(value: unknown): number | null {
  // schema.org types recipeYield as Text *or* Integer, and sites emit both.
  // readString rejects a bare number, so it is handled before the text path.
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readServings(item);
      if (found !== null) return found;
    }
    return null;
  }

  const text = readString(value);
  if (!text) return null;
  const match = /(\d+(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  if (typeof type === "string") return type === "Recipe";
  if (Array.isArray(type)) return type.includes("Recipe");
  return false;
}

/**
 * Walks a parsed JSON-LD document for a Recipe node.
 *
 * Sites commonly wrap the recipe in an `@graph`, or emit an array of unrelated
 * nodes (Organization, BreadcrumbList, WebPage, Recipe). A recursive search is
 * more robust than assuming any particular envelope.
 */
function findRecipeNode(node: unknown, depth = 0): Record<string, unknown> | null {
  // Bounded to stop a maliciously or accidentally cyclic document from
  // exhausting the stack; real documents nest only a few levels.
  if (depth > 8 || node === null || typeof node !== "object") return null;
  if (isRecipeNode(node)) return node;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findRecipeNode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Extracts a recipe from an HTML document.
 *
 * Returns null when the page publishes no schema.org Recipe, which is the
 * signal for the caller to fall back to Claude.
 */
export function extractRecipeFromHtml(
  html: string,
  sourceUrl?: string,
): ImportedRecipe | null {
  const $ = cheerio.load(html);

  let recipeNode: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    if (recipeNode) return;
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed: unknown = jsonValue.parse(JSON.parse(raw));
      recipeNode = findRecipeNode(parsed);
    } catch {
      // Malformed JSON-LD is common enough that it must not abort the scan:
      // a page often carries several blocks and only one is broken.
    }
  });

  if (!recipeNode) return null;
  const node: Record<string, unknown> = recipeNode;

  const title = readString(node["name"]);
  if (!title) return null;

  const ingredients = Array.isArray(node["recipeIngredient"])
    ? node["recipeIngredient"].map(readString).filter((s): s is string => Boolean(s))
    : [];
  const steps = readInstructions(node["recipeInstructions"]);

  // og:image is preferred over the schema.org image: it is the image the site
  // itself chose to represent the page, and is more consistently a single
  // usable URL rather than an ImageObject array.
  const ogImage = $('meta[property="og:image"]').attr("content");
  const imageUrl = ogImage?.trim() || readString(node["image"]);

  return {
    title,
    description: readString(node["description"]),
    ingredientsText: ingredients.join("\n"),
    stepsText: steps.join("\n"),
    servings: readServings(node["recipeYield"]),
    prepMinutes: parseIsoDuration(node["prepTime"]),
    cookMinutes: parseIsoDuration(node["cookTime"]),
    imageUrl: imageUrl ?? null,
    sourceUrl: sourceUrl ?? readString(node["url"]),
  };
}

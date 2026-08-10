import "server-only";
import { callWithTool, type AiResult } from "@/lib/ai/client";
import { categoryNames, kitchenSystem } from "@/lib/ai/context";
import { MODELS } from "@/lib/ai/pricing";
import { recipeDraftSchema, type RecipeDraft } from "@/lib/ai/schemas";

/**
 * Reading a recipe out of prose.
 *
 * This is the *residue* path, not the first resort. A URL import reads the
 * page's schema.org JSON-LD, which most recipe sites publish and which is
 * exact, free, and instant; pasted text is split on a method heading. Claude is
 * for what those leave behind: a page with no structured data, a photograph of
 * a cookbook run through OCR, a message from a friend written as a paragraph.
 *
 * The cheap deterministic paths run first precisely so that this call is rare,
 * which is what makes the monthly ceiling a comfortable one.
 */

/**
 * Upper bound on the text handed to the model.
 *
 * A recipe page's article text is a few thousand characters; a full HTML
 * document with navigation, comments, and inlined scripts can be hundreds of
 * thousands. Trimming bounds the cost of a single import to something
 * predictable, and the recipe is essentially always in the first portion of the
 * document body.
 */
const MAX_INPUT_CHARS = 24_000;

export async function extractRecipe(
  text: string,
  options: { sourceUrl?: string | null } = {},
): Promise<AiResult<RecipeDraft>> {
  const categories = await categoryNames();

  const system = await kitchenSystem(
    [
      "Read the text below and record the recipe it contains.",
      "",
      "Rules:",
      "- Extract, do not invent. Every quantity must come from the text.",
      "- Where the text omits something a cook needs — a temperature, a tin size —",
      "  leave it out of the step and note the omission in the notes field. Do not",
      "  fill the gap with a plausible number, which would be indistinguishable",
      "  from the source's own instruction.",
      "- You may rewrite the steps for clarity, and should: the style rules above",
      "  apply to the extracted recipe as much as to a written one. Rewriting how",
      "  something is said is not the same as changing what it says.",
      "- Ignore navigation, advertisements, comments, and the author's preamble.",
      "",
      `Existing categories in this collection: ${categories.join(", ")}.`,
      "Choose one of them by name. Invent a category only if none of them fits.",
    ].join("\n"),
  );

  const trimmed = text.slice(0, MAX_INPUT_CHARS);
  const prompt = [
    options.sourceUrl ? `Source: ${options.sourceUrl}` : null,
    trimmed.length < text.length
      ? "(The text was truncated; the recipe should be within what follows.)"
      : null,
    "",
    trimmed,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return callWithTool({
    kind: "IMPORT",
    system,
    prompt,
    tool: {
      name: "record_recipe",
      description:
        "Record the recipe found in the text. Call this exactly once, with the complete recipe.",
      schema: recipeDraftSchema,
    },
    model: MODELS.reasoning,
    // Extraction is a reading task with the answer present in the input;
    // the effort that generation needs would be spent on nothing.
    effort: "low",
    maxTokens: 16_000,
  });
}

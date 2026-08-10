import "server-only";
import { callWithTool, type AiResult } from "@/lib/ai/client";
import { categoryNames, kitchenSystem } from "@/lib/ai/context";
import { MODELS } from "@/lib/ai/pricing";
import { recipeDraftSchema, type RecipeDraft } from "@/lib/ai/schemas";

/**
 * Writing a new recipe.
 *
 * Three ways of asking, because they are the three ways the question actually
 * arises in a kitchen: from what is in the fridge, from a dish in mind, or from
 * a nutritional target. They are one call with different framing rather than
 * three features, since the output is the same object in every case.
 *
 * The result is *not* saved by this function. Saving is the caller's decision,
 * and always lands as a `DRAFT` (see `lib/ai/drafts.ts`).
 */

export interface GenerationRequest {
  /** What the owner typed. Free text; the framing below tells Claude how to read it. */
  brief: string;
  /** Ingredients on hand, if the request is "cook something from these". */
  onHand: string;
  /** A per-serving energy target in kcal, if the request is nutritional. */
  targetKcal: number | null;
  servings: number;
}

export async function generateRecipe(
  request: GenerationRequest,
): Promise<AiResult<RecipeDraft>> {
  const categories = await categoryNames();

  const system = await kitchenSystem(
    [
      "Write one complete recipe, in full, that this person can cook tonight.",
      "",
      "Constraints on what you write:",
      "- Use ordinary domestic equipment and ingredients a supermarket stocks.",
      "- Every quantity must be specific. If a quantity genuinely varies, say what",
      "  it varies with, in the notes, rather than leaving the line vague.",
      "- Do not invent a technique to look clever. Cook the dish properly.",
      "",
      `Existing categories in this collection: ${categories.join(", ")}.`,
      "Choose one of them by name. Invent a category only if none of them fits.",
    ].join("\n"),
  );

  const parts: string[] = [];
  if (request.brief.trim()) parts.push(`What they want: ${request.brief.trim()}`);
  if (request.onHand.trim()) {
    parts.push(
      `Ingredients on hand: ${request.onHand.trim()}`,
      "Build the recipe around these. You may assume salt, pepper, oil, and water.",
      "Anything else you add beyond this list, name explicitly in the notes so they know what to buy.",
    );
  }
  if (request.targetKcal !== null) {
    parts.push(
      `Nutritional target: approximately ${request.targetKcal} kcal per serving.`,
      "Hit it by choosing and portioning ingredients, not by shrinking the serving.",
    );
  }
  parts.push(`Write it for ${request.servings} servings.`);

  return callWithTool({
    kind: "GENERATE",
    system,
    prompt: parts.join("\n"),
    tool: {
      name: "write_recipe",
      description:
        "Record the finished recipe. Call this exactly once, with the complete recipe.",
      schema: recipeDraftSchema,
    },
    model: MODELS.reasoning,
    // Composition is the one task here where the quality of the reasoning shows
    // up directly on the plate.
    effort: "high",
    maxTokens: 16_000,
  });
}

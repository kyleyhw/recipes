import "server-only";
import { callWithTool, type AiResult } from "@/lib/ai/client";
import { kitchenSystem } from "@/lib/ai/context";
import { applyLineEdits, type LineEdit } from "@/lib/ai/diff";
import { MODELS } from "@/lib/ai/pricing";
import { substitutionSchema, type Substitution } from "@/lib/ai/schemas";
import { ingredientsToText, stepsToText, type FullRecipe } from "@/lib/recipes";

/**
 * Adjusting a recipe for what is missing.
 *
 * The original request behind this application: it is eight o'clock, the recipe
 * wants buttermilk, and there is none. What is needed is not an essay about
 * buttermilk but a specific replacement line, the ratio it was derived from,
 * an honest statement of what changes, and any method change the swap forces.
 *
 * The answer is returned as a diff against the stored recipe rather than as a
 * rewritten recipe. Two reasons: the owner can see exactly what would change
 * before anything does, and an edit whose target line cannot be found is
 * reported instead of being applied somewhere plausible (`lib/ai/diff.ts`).
 */

export interface SubstitutionPreview {
  substitution: Substitution;
  /** The recipe's ingredient lines after the proposed replacements. */
  ingredientsText: string;
  /** The recipe's steps after the proposed rewrites. */
  stepsText: string;
  /** Proposed edits whose original line matched nothing. Never applied. */
  unmatched: LineEdit[];
  costUsd: number;
}

/** Renders the recipe as the model will see it: the same text the editor shows. */
function describeRecipe(recipe: FullRecipe): string {
  return [
    `Title: ${recipe.title}`,
    `Serves: ${recipe.baseServings} ${recipe.servingLabel}`,
    "",
    "Ingredients (copy these lines exactly when referring to them):",
    ingredientsToText(recipe),
    "",
    "Method (copy these lines exactly when referring to them):",
    stepsToText(recipe),
  ].join("\n");
}

export async function proposeSubstitution(
  recipe: FullRecipe,
  request: string,
): Promise<AiResult<SubstitutionPreview>> {
  const system = await kitchenSystem(
    [
      "The cook is missing an ingredient, or wants one changed. Propose the",
      "substitution, as a set of edits to the recipe they already have.",
      "",
      "Rules:",
      "- Change as little as possible. Edit only the lines the substitution forces.",
      "- Work out the ratio before writing the replacement quantity, and state the",
      "  ratio you used.",
      "- Be honest about what the dish loses. A substitution that changes the dish",
      "  should say so plainly; a cook who is told the truth can decide.",
      "- If nothing sensible can replace it — the missing ingredient is what the",
      "  dish is — set feasible to false and say why.",
      "- When you refer to an existing line, reproduce it character for character.",
      "  An edit that does not match a line cannot be applied.",
    ].join("\n"),
  );

  const result = await callWithTool({
    kind: "SUBSTITUTE",
    recipeId: recipe.id,
    system,
    prompt: [describeRecipe(recipe), "", `What they need: ${request.trim()}`].join("\n"),
    tool: {
      name: "propose_substitution",
      description:
        "Record the proposed substitution as edits to the recipe. Call this exactly once.",
      schema: substitutionSchema,
    },
    model: MODELS.reasoning,
    effort: "medium",
  });

  if (!result.ok) return result;

  const substitution = result.data;

  const ingredientEdits: LineEdit[] = substitution.replacements.map((r) => ({
    from: r.originalRawText,
    to: r.replacementRawText,
  }));
  const stepEdits: LineEdit[] = substitution.stepEdits.map((s) => ({
    from: s.originalText,
    to: s.replacementText,
  }));

  const ingredients = applyLineEdits(
    ingredientsToText(recipe).split("\n"),
    ingredientEdits,
  );
  const steps = applyLineEdits(stepsToText(recipe).split("\n"), stepEdits);

  return {
    ok: true,
    costUsd: result.costUsd,
    data: {
      substitution,
      ingredientsText: ingredients.lines.join("\n"),
      stepsText: steps.lines.join("\n"),
      unmatched: [...ingredients.unmatched, ...steps.unmatched],
      costUsd: result.costUsd,
    },
  };
}

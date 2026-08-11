import "server-only";
import { callWithTool, type AiFailure } from "@/lib/ai/client";
import { kitchenSystem } from "@/lib/ai/context";
import { linesChanged } from "@/lib/ai/diff";
import { MODELS } from "@/lib/ai/pricing";
import { revisionProposalSchema } from "@/lib/ai/schemas";
import {
  addEntry,
  listEntries,
  logForPrompt,
  recordRevision,
  snapshotOf,
} from "@/lib/journal";
import {
  ingredientsToText,
  stepsToText,
  tagsToText,
  updateRecipe,
  type FullRecipe,
} from "@/lib/recipes";

/**
 * Acting on a message in a recipe's log.
 *
 * This is the feature the whole log exists for: you cook the recipe, find it
 * wants more butter, say so, and the recipe changes — with the reason recorded
 * next to the change, and every earlier version still recoverable.
 *
 * The change is **applied**, not previewed. That was a deliberate choice: this
 * is used standing at a counter with one hand, where a two-step accept flow is
 * friction at exactly the wrong moment. It is safe because it is reversible —
 * every revision is a complete snapshot, the diff is shown after the fact, and
 * the previous version is one click away. The substitution page keeps its
 * preview, because there the question is "what would this do?" rather than "do
 * this".
 */

export interface RevisionOutcome {
  ok: true;
  /** What Claude said back. Recorded in the log as a reply. */
  reply: string;
  /** Null when the recipe was left alone. */
  revisionId: string | null;
  summary: string;
  costUsd: number;
}

export type ReviseResult = RevisionOutcome | AiFailure;

function describeRecipe(recipe: FullRecipe): string {
  return [
    `Title: ${recipe.title}`,
    `Serves: ${recipe.baseServings} ${recipe.servingLabel}`,
    recipe.notes ? `Notes: ${recipe.notes}` : null,
    "",
    "Ingredients:",
    ingredientsToText(recipe),
    "",
    "Method:",
    stepsToText(recipe),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Sends a message to Claude and applies whatever it decides to change.
 *
 * The message is written to the log first, so a call that fails halfway still
 * leaves the cook's own words recorded. Losing a note because a remote service
 * was unreachable would be the worst failure this feature could have: the note
 * is the part that cannot be reconstructed.
 */
export async function reviseFromMessage(
  recipe: FullRecipe,
  message: string,
): Promise<ReviseResult> {
  const entryId = await addEntry(recipe.id, "MESSAGE", message);

  const history = await listEntries(recipe.id);
  // Drop the message just written; it is the prompt, not context for itself.
  const priorLog = logForPrompt(history.filter((entry) => entry.id !== entryId));

  const system = await kitchenSystem(
    [
      "The cook has this recipe open and has said something about it. It may be a",
      "correction after cooking it, a question, or a note to remember.",
      "",
      "Decide whether the recipe should change, and if so, change it:",
      "- A correction from having cooked it outranks whatever the recipe says now.",
      "  They have made it and you have not.",
      "- Change what follows from what they said, and what that forces. If more",
      "  butter means a longer bake, change the bake too, and say so.",
      "- Do not take the opportunity to improve anything else. An unrequested",
      "  change to a recipe someone is cooking from is worse than no change.",
      "- A question is not an instruction. Answer it and leave the recipe alone.",
      "",
      "When you do change the ingredients or the method, return the COMPLETE new",
      "list. Anything you leave out is deleted from their recipe.",
    ].join("\n"),
  );

  const result = await callWithTool({
    kind: "REVISE",
    recipeId: recipe.id,
    system,
    prompt: [describeRecipe(recipe), "", priorLog, "", `They say: ${message.trim()}`]
      .filter((part) => part !== "")
      .join("\n"),
    tool: {
      name: "revise_recipe",
      description:
        "Answer the cook, and record any change to the recipe. Call this exactly once.",
      schema: revisionProposalSchema,
    },
    model: MODELS.reasoning,
    effort: "medium",
  });

  if (!result.ok) return result;

  const proposal = result.data;
  await addEntry(recipe.id, "REPLY", proposal.reply);

  const before = snapshotOf(recipe);
  const currentIngredients = before.ingredients;
  const currentSteps = before.steps;

  // An empty list is refused rather than applied. The schema constrains the
  // type, not the length, and "delete every ingredient" is never what a cook
  // meant by anything they could plausibly have typed.
  const nextIngredients =
    proposal.ingredients && proposal.ingredients.filter((l) => l.trim()).length > 0
      ? proposal.ingredients.map((line) => line.trim()).filter(Boolean)
      : currentIngredients;
  const nextSteps =
    proposal.steps && proposal.steps.filter((l) => l.trim()).length > 0
      ? proposal.steps.map((line) => line.trim()).filter(Boolean)
      : currentSteps;
  const nextNotes = proposal.notes ?? recipe.notes;

  const somethingChanged =
    linesChanged(currentIngredients, nextIngredients) ||
    linesChanged(currentSteps, nextSteps) ||
    nextNotes !== recipe.notes;

  // `changed` is the model's claim; `somethingChanged` is what the text
  // actually says. Requiring both stops a revision being recorded for a reply
  // that altered nothing, which would fill the history with empty versions.
  if (!proposal.changed || !somethingChanged) {
    return {
      ok: true,
      reply: proposal.reply,
      revisionId: null,
      summary: "",
      costUsd: result.costUsd,
    };
  }

  await updateRecipe(recipe.id, {
    title: recipe.title,
    description: recipe.description,
    categoryId: recipe.categoryId,
    baseServings: recipe.baseServings,
    servingLabel: recipe.servingLabel,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    sourceUrl: recipe.sourceUrl,
    notes: nextNotes,
    status: recipe.status,
    ingredientsText: nextIngredients.join("\n"),
    stepsText: nextSteps.join("\n"),
    tagsText: tagsToText(recipe),
  });

  const summary = proposal.summary.trim() || "Changed after a note in the log.";
  const revisionId = await recordRevision(recipe.id, "CHAT", summary, {
    baseline: before,
    entryId,
  });

  return {
    ok: true,
    reply: proposal.reply,
    revisionId,
    summary,
    costUsd: result.costUsd,
  };
}

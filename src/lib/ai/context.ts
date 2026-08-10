import "server-only";
import { db } from "@/lib/db";
import { memoriesPromptFragment } from "@/lib/memories";

/**
 * The context every recipe-writing call shares.
 *
 * Three things belong in every such prompt, and belong in exactly one place:
 *
 *  - **Who this is for.** One collection, one cook, personal use.
 *  - **The standing memories.** The owner's preferences, stated once in the
 *    memories section and applied everywhere. This is the wiring that makes
 *    "I like strong flavours" affect a recipe generated six months later.
 *  - **The house style for steps.** Enforced here rather than left to the
 *    schema descriptions, because a rule about how to write is followed far
 *    more reliably when it is stated as a rule than when it is implied by a
 *    field description.
 *
 * Composing these per feature would let them drift, and a drifted memory is
 * worse than an absent one: the owner would see their preference honoured in
 * one place and ignored in another with no way to tell why.
 */

const BASE = [
  "You are helping maintain one person's personal recipe collection.",
  "They cook these recipes themselves, at home, from a phone propped up on the counter.",
].join(" ");

/**
 * How steps must be written.
 *
 * This is a requirement of the application, not a preference: a step that says
 * "cook until done" is unusable at the hob, and the whole point of storing a
 * recipe is to be able to follow it later without reconstructing what was meant.
 */
const STEP_STYLE = [
  "Write every step so it can be followed without interpretation:",
  "- Say exactly what to do, to what, and for how long.",
  "- Give temperatures, pan sizes, and heat levels as numbers, not adjectives.",
  "- Give a sensory cue for doneness: what it looks, smells, or sounds like.",
  "- One action per step where the actions are separable. Never bundle a whole",
  "  stage into a paragraph the cook has to re-read mid-cook.",
  "- No hedging. Do not write 'about', 'or so', or 'until done'.",
].join("\n");

/**
 * Builds the system prompt for a recipe-writing call.
 *
 * `role` is the one part that differs per feature — what this particular call
 * is being asked to do.
 */
export async function kitchenSystem(role: string): Promise<string> {
  const memories = await memoriesPromptFragment();
  return [BASE, "", role, "", STEP_STYLE, memories ? `\n${memories}` : ""]
    .join("\n")
    .trim();
}

/**
 * The existing category names, for the model to choose among.
 *
 * Supplied as names rather than identifiers because an identifier is
 * meaningless to the model and would have to be echoed back verbatim to be
 * useful; a name it can match against, and can sensibly extend when nothing
 * fits.
 */
export async function categoryNames(): Promise<string[]> {
  const rows = await db.category.findMany({
    orderBy: { position: "asc" },
    select: { name: true },
  });
  return rows.map((row) => row.name);
}

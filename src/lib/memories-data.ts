/**
 * Built-in memories: standing instructions present in every deployment.
 *
 * Kept in its own module, free of `server-only` and of any database import, so
 * that `prisma/seed.ts` can read it. The seed runs as a plain Node script
 * outside Next's server context, where `server-only` throws.
 *
 * `builtIn` memories are editable but not deletable. The distinction is that
 * these encode a requirement the *application* depends on — a recipe whose
 * steps are vague is a worse artefact regardless of anyone's taste — whereas an
 * ordinary memory is pure preference and can be removed freely.
 */
export const BUILT_IN_MEMORIES: ReadonlyArray<{ text: string; position: number }> = [
  {
    position: 0,
    text:
      "I like strong, assertive flavours. Be generous with aromatics, acid, salt, " +
      "chilli, herbs, and spice rather than cautious. Prefer a dish that tastes of " +
      "something definite over one balanced into blandness. When choosing between a " +
      "timid and a bold amount, choose the bold one.",
  },
  {
    position: 1,
    text:
      "Method steps must be unambiguous, direct, and straightforward. Use the " +
      "imperative. One action per step. Give exact quantities, temperatures, pan " +
      "sizes, and times, plus a sensory cue for doneness wherever timing alone is " +
      'unreliable ("until the edges are set and the centre still wobbles"). Never ' +
      'write "cook until done", "adjust as needed", or any instruction whose ' +
      "completion the cook cannot verify by looking at the pan. Do not hedge, do not " +
      "offer alternatives inside a step, and do not bundle several actions into one " +
      "sentence.",
  },
];

import "server-only";
import { db } from "@/lib/db";

/**
 * Standing owner preferences, applied to everything Claude produces.
 *
 * A memory is a sentence the owner wants respected in every generated or
 * adjusted recipe — "I like strong flavours", "steps must be unambiguous". They
 * are stored rather than typed per request, so a preference is stated once and
 * then honoured by generation, substitution, and import alike.
 *
 * Free text rather than structured settings, because the useful preferences are
 * not enumerable in advance and the consumer is a language model, which reads
 * prose perfectly well.
 */

export { BUILT_IN_MEMORIES } from "@/lib/memories-data";

export interface Memory {
  id: string;
  text: string;
  position: number;
  builtIn: boolean;
}

export async function listMemories(): Promise<Memory[]> {
  return db.memory.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, text: true, position: true, builtIn: true },
  });
}

export async function addMemory(text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;
  const last = await db.memory.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await db.memory.create({
    data: { text: trimmed, position: (last?.position ?? -1) + 1 },
  });
}

export async function updateMemory(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;
  await db.memory.update({ where: { id }, data: { text: trimmed } });
}

/** Built-in memories are not deletable; the delete is a no-op for them. */
export async function deleteMemory(id: string): Promise<void> {
  await db.memory.deleteMany({ where: { id, builtIn: false } });
}

/**
 * Renders the memories as a prompt fragment.
 *
 * Returns an empty string when there are none, so callers can concatenate
 * unconditionally without producing a dangling heading.
 *
 * The framing is deliberately strong ("standing instructions", "follow them")
 * rather than descriptive ("the user likes..."), because a preference phrased
 * as background information is routinely ignored in favour of the immediate
 * request, whereas one phrased as an instruction is not.
 */
export async function memoriesPromptFragment(): Promise<string> {
  const memories = await listMemories();
  if (memories.length === 0) return "";

  const lines = memories.map((m) => `- ${m.text}`).join("\n");
  return [
    "The person you are cooking for has given these standing instructions.",
    "They apply to every recipe you write or adjust. Follow them.",
    "",
    lines,
  ].join("\n");
}

import { revalidatePath } from "next/cache";
import { addMemory, deleteMemory, listMemories, updateMemory } from "@/lib/memories";
import { features } from "@/lib/env";

/**
 * Memories: standing instructions applied to everything Claude produces.
 *
 * Each memory is its own form so that editing one does not require submitting
 * the others, and so the page needs no client-side state.
 */
export default async function MemoriesPage() {
  const memories = await listMemories();

  async function create(formData: FormData): Promise<void> {
    "use server";
    await addMemory(String(formData.get("text") ?? ""));
    revalidatePath("/memories");
  }

  async function save(formData: FormData): Promise<void> {
    "use server";
    const id = String(formData.get("id") ?? "");
    await updateMemory(id, String(formData.get("text") ?? ""));
    revalidatePath("/memories");
  }

  async function remove(formData: FormData): Promise<void> {
    "use server";
    await deleteMemory(String(formData.get("id") ?? ""));
    revalidatePath("/memories");
  }

  const inputClass =
    "w-full rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Memories</h1>
      <p className="mt-1 text-sm text-text-muted">
        Standing instructions applied to every recipe Claude writes or adjusts — taste,
        style, dietary constraints, how method steps should read. Written once here rather
        than repeated in every request.
      </p>

      {!features.ai ? (
        <p className="mt-4 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn">
          No <code>ANTHROPIC_API_KEY</code> is configured, so nothing currently reads
          these. They are kept and will apply as soon as one is set.
        </p>
      ) : null}

      <ul className="mt-8 flex flex-col gap-5">
        {memories.map((memory) => (
          <li key={memory.id}>
            <form action={save} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={memory.id} />
              <textarea
                name="text"
                rows={4}
                defaultValue={memory.text}
                className={inputClass}
                aria-label="Memory text"
              />
              <div className="flex items-center gap-4 text-xs">
                <button type="submit" className="text-accent hover:underline">
                  Save
                </button>
                {memory.builtIn ? (
                  <span
                    className="text-text-muted"
                    title="Built-in memories can be reworded but not removed"
                  >
                    Built in
                  </span>
                ) : null}
              </div>
            </form>
            {!memory.builtIn ? (
              <form action={remove} className="mt-1">
                <input type="hidden" name="id" value={memory.id} />
                <button type="submit" className="text-xs text-danger hover:underline">
                  Delete
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      <form
        action={create}
        className="mt-10 flex flex-col gap-2 border-t border-border pt-6"
      >
        <label htmlFor="text" className="text-sm font-medium">
          Add a memory
        </label>
        <textarea
          id="text"
          name="text"
          rows={3}
          placeholder="e.g. Never suggest coriander — it tastes of soap to me."
          className={inputClass}
        />
        <button
          type="submit"
          className="self-start rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Add
        </button>
      </form>
    </div>
  );
}

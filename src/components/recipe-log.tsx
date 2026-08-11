import Link from "next/link";
import type { Entry } from "@/lib/journal";

/**
 * The recipe's log: notes, messages to Claude, and its replies.
 *
 * Closed by default and opened from a single quiet line, because the recipe is
 * what the page is for. Open state lives in the URL (`?chat=1`), like the
 * serving count and the search query, so the layout can genuinely change on a
 * wide screen without a client component, and the back button closes it.
 *
 * Two ways to write, in one box:
 *
 *  - **Note it** records what you typed and costs nothing. For "made it with
 *    half the chilli, better."
 *  - **Ask Claude** sends it, and the recipe changes if it should.
 *
 * They share a textarea because the distinction is about what you want done,
 * not about what you are writing, and making it a choice of button at the
 * moment of sending is the smallest way to express that.
 */

function timeLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RecipeLog({
  slug,
  entries,
  revisionCount,
  aiEnabled,
  noteAction,
  askAction,
  deleteAction,
  error,
}: {
  slug: string;
  entries: Entry[];
  revisionCount: number;
  aiEnabled: boolean;
  noteAction: (formData: FormData) => Promise<void>;
  askAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  error?: string | undefined;
}) {
  return (
    <section
      id="log"
      className="rounded-card border border-border bg-surface p-4 lg:sticky lg:top-6"
      aria-label="Notes and chat"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Notes</h2>
        <div className="flex items-center gap-3 text-xs">
          {revisionCount > 0 ? (
            <Link
              href={`/recipes/${slug}/history`}
              className="text-text-muted hover:text-text"
            >
              History ({revisionCount})
            </Link>
          ) : null}
          <Link href={`/recipes/${slug}`} className="text-text-muted hover:text-text">
            Close
          </Link>
        </div>
      </div>

      {error ? (
        <p
          className="mt-3 rounded-card bg-warn-soft px-3 py-2 text-xs text-warn"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
                  {entry.kind === "REPLY"
                    ? "Claude"
                    : entry.kind === "NOTE"
                      ? "Note"
                      : "You"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="numeric text-xs text-text-muted">
                    {timeLabel(entry.createdAt)}
                  </span>
                  {entry.kind !== "REPLY" ? (
                    <form action={deleteAction}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <button
                        type="submit"
                        className="text-xs text-text-muted hover:text-danger"
                        aria-label="Delete this entry"
                      >
                        ×
                      </button>
                    </form>
                  ) : null}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-line">{entry.text}</p>
              {entry.revision ? (
                <Link
                  href={`/recipes/${slug}/history#v${entry.revision.number}`}
                  className="mt-1 block text-xs text-accent hover:underline"
                >
                  {entry.revision.summary}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-text-muted">
          Nothing yet. Write down what happened when you cooked it — what you changed,
          what you would change next time.
        </p>
      )}

      <form action={noteAction} className="mt-4 flex flex-col gap-2">
        <label htmlFor="entryText" className="sr-only">
          A note about this recipe
        </label>
        <textarea
          id="entryText"
          name="text"
          rows={3}
          placeholder="Needed more butter — the crumb was dry."
          className="w-full rounded-card border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-card border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium"
          >
            Note it
          </button>
          {aiEnabled ? (
            <button
              type="submit"
              formAction={askAction}
              className="rounded-card bg-accent px-3 py-1.5 text-sm font-medium text-white"
            >
              Ask Claude
            </button>
          ) : null}
        </div>
        {aiEnabled ? (
          <p className="text-xs text-text-muted">
            Asking changes the recipe if it should. Every version is kept, so anything can
            be put back.
          </p>
        ) : null}
      </form>
    </section>
  );
}

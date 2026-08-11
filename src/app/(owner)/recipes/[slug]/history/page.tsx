import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { lineDiff } from "@/lib/ai/diff";
import { listRevisions, restoreRevision, type Revision } from "@/lib/journal";
import { getRecipeBySlug } from "@/lib/recipes";
import type { RecipeSnapshot } from "@/lib/snapshot";

/**
 * Every version this recipe has had.
 *
 * Each revision is a complete snapshot, so what is shown here is not a
 * reconstruction: the diff against the previous version is computed for display
 * only, and restoring uses the snapshot itself. A corrupted or unreadable row
 * therefore costs that one version rather than everything after it.
 *
 * Newest first, because the question a cook has is almost always "what did I
 * just change?" and only occasionally "what was this originally?".
 */

const SOURCE_LABELS: Record<Revision["source"], string> = {
  INITIAL: "Before the first recorded change",
  CHAT: "From a note",
  EDIT: "Edited",
  RESTORE: "Restored",
};

function DiffBlock({
  title,
  before,
  after,
}: {
  title: string;
  before: string[];
  after: string[];
}) {
  const diff = lineDiff(before, after);
  if (!diff.some((line) => line.op !== "kept")) return null;

  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium tracking-wide text-text-muted uppercase">
        {title}
      </h4>
      <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
        {diff.map((line, index) => (
          <li
            // Lines repeat within a recipe ("salt to taste" twice), so the index
            // is part of the identity; the text alone is not unique.
            key={`${line.op}-${index}-${line.text}`}
            className={
              line.op === "added"
                ? "text-accent"
                : line.op === "removed"
                  ? "text-danger line-through"
                  : "text-text-muted"
            }
          >
            <span aria-hidden="true">
              {line.op === "added" ? "+ " : line.op === "removed" ? "− " : "  "}
            </span>
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function scalarChanges(
  previous: RecipeSnapshot | null,
  current: RecipeSnapshot,
): string[] {
  if (!previous) return [];
  const changes: string[] = [];
  if (previous.title !== current.title) {
    changes.push(`Title: “${previous.title}” → “${current.title}”`);
  }
  if (previous.baseServings !== current.baseServings) {
    changes.push(`Serves: ${previous.baseServings} → ${current.baseServings}`);
  }
  if (previous.prepMinutes !== current.prepMinutes) {
    changes.push(
      `Prep: ${previous.prepMinutes ?? "—"} → ${current.prepMinutes ?? "—"} min`,
    );
  }
  if (previous.cookMinutes !== current.cookMinutes) {
    changes.push(
      `Cook: ${previous.cookMinutes ?? "—"} → ${current.cookMinutes ?? "—"} min`,
    );
  }
  if (previous.notes !== current.notes) changes.push("Recipe notes changed");
  if (previous.sourceUrl !== current.sourceUrl) changes.push("Source changed");
  return changes;
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const recipeId = recipe.id;
  const revisions = await listRevisions(recipeId);

  async function restore(formData: FormData): Promise<void> {
    "use server";
    const revisionId = String(formData.get("revisionId") ?? "");
    const outcome = await restoreRevision(recipeId, revisionId);
    revalidatePath("/");
    revalidatePath(`/recipes/${slug}`);
    redirect(
      outcome.ok
        ? `/recipes/${outcome.slug}`
        : `/recipes/${slug}/history?error=${encodeURIComponent(outcome.error)}`,
    );
  }

  const newestFirst = [...revisions].reverse();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/recipes/${recipe.slug}`}
        className="text-xs text-text-muted hover:text-text"
      >
        ← {recipe.title}
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-text-muted">
        Every version this recipe has had. Restoring one does not delete the others — the
        restore is recorded as a version of its own, so it can itself be undone.
      </p>

      {error ? (
        <p
          className="mt-4 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {revisions.length === 0 ? (
        <p className="mt-8 rounded-card border border-dashed border-border px-6 py-10 text-center text-sm text-text-muted">
          No versions recorded yet. The first change to this recipe will capture what it
          looks like now, so that version can always be recovered.
        </p>
      ) : (
        <ol className="mt-8 flex flex-col gap-6">
          {newestFirst.map((revision, index) => {
            // `newestFirst` is reversed, so the *next* entry in this list is the
            // chronologically previous version.
            const previous = newestFirst[index + 1]?.snapshot ?? null;
            const isCurrent = index === 0;
            const scalars = revision.snapshot
              ? scalarChanges(previous, revision.snapshot)
              : [];

            return (
              <li
                key={revision.id}
                id={`v${revision.number}`}
                className="rounded-card border border-border bg-surface p-4 scroll-mt-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    <span className="numeric">Version {revision.number}</span>
                    {isCurrent ? (
                      <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-text-muted">
                        current
                      </span>
                    ) : null}
                  </h2>
                  <span className="numeric text-xs text-text-muted">
                    {revision.createdAt.toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <p className="mt-1 text-xs text-text-muted">
                  {SOURCE_LABELS[revision.source]}
                </p>
                <p className="mt-1 text-sm">{revision.summary}</p>

                {/* The reason, when there was one. A history that records what
                    changed but not why is half a history. */}
                {revision.reason ? (
                  <p className="mt-2 border-l-2 border-border pl-3 text-sm text-text-muted">
                    {revision.reason.text}
                  </p>
                ) : null}

                {revision.snapshot === null ? (
                  <p className="mt-3 text-xs text-warn">
                    This version could not be read, so it cannot be restored. The others
                    are unaffected.
                  </p>
                ) : (
                  <>
                    {scalars.length > 0 ? (
                      <ul className="mt-3 flex flex-col gap-0.5 text-xs text-text-muted">
                        {scalars.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    ) : null}

                    {previous ? (
                      <>
                        <DiffBlock
                          title="Ingredients"
                          before={previous.ingredients}
                          after={revision.snapshot.ingredients}
                        />
                        <DiffBlock
                          title="Method"
                          before={previous.steps}
                          after={revision.snapshot.steps}
                        />
                      </>
                    ) : (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-text-muted">
                          Show this version in full
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap">
                          {[
                            ...revision.snapshot.ingredients,
                            "",
                            ...revision.snapshot.steps,
                          ].join("\n")}
                        </pre>
                      </details>
                    )}

                    {isCurrent ? null : (
                      <form action={restore} className="mt-4">
                        <input type="hidden" name="revisionId" value={revision.id} />
                        <button
                          type="submit"
                          className="rounded-card border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium"
                        >
                          Restore this version
                        </button>
                      </form>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

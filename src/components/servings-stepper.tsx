import Link from "next/link";

/**
 * Servings control.
 *
 * Links rather than buttons, writing to the `servings` query parameter, so
 * scaling is a URL: shareable, bookmarkable, restored by the back button, and
 * working with no client-side JavaScript. The scaled view is a *view* — the
 * stored recipe keeps its base servings.
 */
export function ServingsStepper({
  basePath,
  baseServings,
  servingLabel,
  current,
}: {
  /** Path the links point at, without a query string: "/recipes/lemon-cake". */
  basePath: string;
  baseServings: number;
  servingLabel: string;
  current: number;
}) {
  // A quarter batch is the practical floor; below that, quantities fall under
  // the smallest fraction the renderer can express and become decimals.
  const min = Math.max(0.25, baseServings / 4);
  const step = baseServings >= 8 ? 2 : baseServings >= 4 ? 1 : 0.5;

  const down = Math.max(min, Math.round((current - step) * 100) / 100);
  const up = Math.round((current + step) * 100) / 100;
  const scaled = Math.abs(current - baseServings) > 1e-9;

  // At the base size the query parameter is dropped entirely, so the canonical
  // URL of an unscaled recipe has no scaling state in it.
  const href = (value: number) =>
    value === baseServings ? basePath : `${basePath}?servings=${value}`;

  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-card border border-border bg-surface text-lg leading-none hover:border-accent";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Link
          href={href(down)}
          aria-label="Fewer servings"
          rel="nofollow"
          className={buttonClass}
        >
          −
        </Link>
        <span className="numeric min-w-[7ch] text-center text-sm font-medium">
          {current} {servingLabel}
          {current === 1 ? "" : "s"}
        </span>
        <Link
          href={href(up)}
          aria-label="More servings"
          rel="nofollow"
          className={buttonClass}
        >
          +
        </Link>
      </div>

      {scaled ? (
        <Link
          href={href(baseServings)}
          className="text-xs text-text-muted hover:text-text"
        >
          Reset to {baseServings}
        </Link>
      ) : null}
    </div>
  );
}

"use client";

import { useT } from "@/components/language";

/**
 * Where a recipe came from.
 *
 * A recipe taken off a website is not this collection's work, and the address it
 * came from is the only thing that makes it checkable later — when a step reads
 * oddly, when the quantities look wrong, when someone asks where it is from. It
 * is stored on the recipe, travels in the sharing bundle and both exports, and
 * is shown here rather than buried behind a word.
 *
 * The site's own name is the visible label because that is what a person
 * remembers; the full address is the link target and the tooltip.
 *
 * The caller sets the type size. Baking one in here and then overriding it from
 * a `className` would leave two Tailwind size classes on the same element, and
 * which of them wins is decided by the order they happen to appear in the
 * generated stylesheet rather than by anything visible at the call site.
 */
export function SourceLine({
  sourceUrl,
  className = "text-sm",
}: {
  sourceUrl: string | null;
  className?: string;
}) {
  const t = useT();
  if (!sourceUrl) return null;

  let host = sourceUrl;
  try {
    host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    // A stored value that is not a URL is still worth showing verbatim: it may
    // be a book, a person, or a note to self, and hiding it would lose it.
  }

  return (
    <p className={`text-text-muted ${className}`}>
      {t("from")}{" "}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        title={sourceUrl}
        className="underline hover:text-text"
      >
        {host}
      </a>
    </p>
  );
}

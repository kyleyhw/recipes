"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/language";
import { linkTitles, type TitleTarget } from "@/lib/content/cross-links";

/**
 * A block of a recipe's own prose, with any recipe it names linked.
 *
 * Notes and Storage are plain text by design — see content/memories.md — so a
 * recipe points at another one by writing its name, the way a person would.
 * This is what makes that name clickable, and it is the only thing in these
 * sections that is not literal.
 *
 * The titles come in for every language the collection has, so a Russian note
 * naming a Russian title links as readily as an English one. The text itself is
 * whichever translation is showing.
 */
export function Prose({
  en,
  translated,
  titles,
  className = "",
}: {
  en: string;
  translated: Record<string, string | null | undefined>;
  /** Every recipe's title, in every language, with the slug to link to. */
  titles: readonly TitleTarget[];
  className?: string;
}) {
  const language = useLanguage();
  const text = translated[language] || en;

  return (
    <p className={`whitespace-pre-line ${className}`}>
      {linkTitles(text, titles).map((chunk, index) =>
        typeof chunk === "string" ? (
          <Fragment key={index}>{chunk}</Fragment>
        ) : (
          <Link
            key={index}
            href={`/recipes/${chunk.slug}`}
            className="underline hover:text-text"
          >
            {chunk.text}
          </Link>
        ),
      )}
    </p>
  );
}

"use client";

import { useState } from "react";
import { useT } from "@/components/language";
import { translate, type StringKey } from "@/lib/i18n/strings";
import { useLanguage } from "@/components/language";
import type { DietKey } from "@/lib/content/diet";

/**
 * What the reader can eat.
 *
 * Its own control rather than a row in the arrange menu, because it is its own
 * question. Everything in that menu answers "how would you like this laid
 * out?"; this one answers "what is off the table?", and the two are combined
 * rather than chosen between — somebody sorting by protein still cannot eat
 * shellfish.
 *
 * Multi-select, which is the other reason it could not live there. The existing
 * filters take one value each because a recipe has one cuisine and one author;
 * a reader has as many dietary rules as they have, and no pork *and* no
 * shellfish is an ordinary combination. Every box is independent and they are
 * all ANDed.
 *
 * The count beside each is over the whole listing, not over what is left after
 * the other boxes — a menu whose numbers move as you tick through it cannot be
 * read. Diets with a count of zero are still offered: "is there anything here I
 * can eat?" is a real question and the honest answer to it is sometimes none.
 */
export function DietMenu({
  value,
  onChange,
  counts,
}: {
  value: DietKey[];
  onChange: (next: DietKey[]) => void;
  counts: Array<{ value: DietKey; count: number }>;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const language = useLanguage();

  const chosen = new Set(value);
  const label = (key: DietKey) => translate(language, `diet.${key}` as StringKey);

  function toggle(key: DietKey): void {
    onChange(chosen.has(key) ? value.filter((k) => k !== key) : [...value, key]);
  }

  return (
    <div
      className="group relative"
      onMouseLeave={() => setOpen(false)}
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("dietLabel")}
        className="px-2 py-2 text-sm text-text-muted hover:text-text"
      >
        {/* The trigger says what it is set to, like the arrange menu beside it.
            Past two, the names would push the search field off a phone, so it
            counts instead. */}
        {value.length === 0
          ? t("dietLabel")
          : value.length <= 2
            ? value.map(label).join(", ")
            : `${t("dietLabel")} ${value.length}`}
      </button>

      <div
        role="menu"
        className="absolute top-full right-0 z-30 hidden w-64 pt-1 group-hover:block group-focus-within:block group-data-open:block"
      >
        <div className="flex flex-col rounded-card border border-border bg-surface py-1 shadow-lg">
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            <li>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value.length === 0}
                onClick={() => onChange([])}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                  value.length === 0 ? "text-accent" : "text-text-muted"
                }`}
              >
                {t("dietNone")}
              </button>
            </li>
            {counts.map((option) => {
              const on = chosen.has(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(option.value)}
                    className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                      on ? "text-accent" : "text-text-muted"
                    }`}
                  >
                    <span>
                      {/* A tick rather than a checkbox input: the row is
                          already a button, and a real checkbox inside it would
                          be a second thing to click that does the same job. */}
                      <span aria-hidden="true" className="mr-2">
                        {on ? "✓" : "  "}
                      </span>
                      {label(option.value)}
                    </span>
                    <span className="numeric text-xs text-text-muted">
                      {option.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Inside the menu, where the decision is being made, rather than in
              a footnote nobody scrolls to. What this filter reads is a list of
              ingredients in a text file, and saying so is the difference
              between a convenience and a claim about somebody's allergy. */}
          <p className="border-t border-border px-3 pt-2 pb-1 text-xs text-text-muted">
            {t("dietNote")}
          </p>
        </div>
      </div>
    </div>
  );
}

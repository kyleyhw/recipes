"use client";

import { useState } from "react";
import { SORT_LABELS, type SortKey } from "@/lib/content/summary";

/**
 * How the listing is arranged.
 *
 * One word, and the choices on hover. A native `<select>` cannot open on
 * hover — the browser owns that behaviour — so this is a button and a panel,
 * which is also the only way to mark the current choice inside the menu rather
 * than spending the trigger's width restating it.
 *
 * Three ways in, because hover alone is not an interaction on half the devices
 * this site is used on:
 *
 *   - **hover**, via `group-hover`, for a pointer;
 *   - **focus**, via `group-focus-within`, so it opens on Tab and stays open
 *     while arrowing through the options with a keyboard;
 *   - **click**, held in React state, for touch, where there is no hover at all
 *     and a hover-only menu would simply never open.
 *
 * The panel is glued to the trigger with no gap between them. A gap looks
 * tidier and closes the menu the instant the pointer crosses it.
 */
export function SortMenu({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(SORT_LABELS) as SortKey[];

  function choose(key: SortKey): void {
    onChange(key);
    setOpen(false);
    // Drop focus, or `group-focus-within` holds the panel open over the result
    // the reader just asked to see.
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur();
    }
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
        className="rounded-card border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text"
      >
        Sort
      </button>

      <div
        role="menu"
        className="absolute top-full right-0 z-30 hidden min-w-44 pt-1 group-hover:block group-focus-within:block group-data-open:block"
      >
        <ul className="flex flex-col rounded-card border border-border bg-surface py-1 shadow-lg">
          {keys.map((key) => (
            <li key={key}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={key === value}
                onClick={() => choose(key)}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                  key === value ? "text-accent" : "text-text-muted"
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

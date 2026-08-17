"use client";

import { useState } from "react";
import { useT } from "@/components/language";
import { useLanguage } from "@/components/language";
import { translateCategory } from "@/lib/i18n/strings";
import {
  nextSort,
  SORT_DIRECTIONS,
  SORT_ROWS,
  SORT_STRING_KEYS,
  UNATTRIBUTED_SHELF,
  type FilterField,
  type Filters,
  type SortKey,
  type SortRow,
} from "@/lib/content/summary";

/**
 * How the listing is arranged, and what it is narrowed to.
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
 *
 * ## Two kinds of row
 *
 * **Orderings toggle.** "Quickest first" and "Longest first" used to be two
 * rows; they are one, because they are the same question asked in two
 * directions, and listing both made a reader hunt for the opposite of what they
 * had chosen in order to undo it. Clicking cycles primary → reverse → off, and
 * an arrow says which way it currently runs. A row that is off shows no arrow,
 * because it has no direction to report.
 *
 * **Groupings can also filter.** Cuisine and Added by open a submenu of the
 * values the collection actually contains. Clicking the row itself groups the
 * listing by that field, which is what the row did before; picking a value from
 * the submenu narrows to it instead. The two live on one row because they are
 * one question — "by cuisine" and "Thai only" are the same thought, arrived at
 * a second apart.
 *
 * ## One variable decides which submenu is open
 *
 * The panel itself opens on CSS hover, which is fine because there is only one
 * of it. The submenus cannot work that way: with `group-hover` on each row *and*
 * a click-held state for touch, clicking one row's arrow and then hovering
 * another showed both submenus at once, overlapping, with no way to tell which
 * of them the next click would apply to.
 *
 * So `openFilter` is the only thing that decides, and hover, focus and click all
 * write to it — hovering any row without a submenu writes `null`, which is what
 * closes the last one. A pointer moving down the menu therefore opens and closes
 * submenus as it goes, and a tap on an arrow holds one open, and the two cannot
 * disagree because there is only one variable.
 *
 * The submenu opens to the **right**, alongside the panel — but only where it
 * fits. The panel is right-aligned under a trigger that sits at the right edge
 * of a centred column, so on a 1100 px window there are 38 px of page margin to
 * its right and a submenu opening into them is half off the screen. So the row
 * is measured when it opens and the submenu flips to the left when the window
 * cannot take it. A fixed breakpoint cannot decide this: what matters is the
 * distance from the panel's right edge to the edge of the window, and that
 * depends on the column width and the window together.
 */
export function SortMenu({
  value,
  onChange,
  filters,
  onFilter,
  options,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
  filters: Filters;
  onFilter: (field: FilterField, value: string | null) => void;
  /** The values each filterable field takes in this listing, with counts. */
  options: Record<FilterField, Array<{ value: string; count: number }>>;
}) {
  const [open, setOpen] = useState(false);
  // Which submenu a *tap* has opened. Hover and focus are handled in CSS; this
  // exists only for touch, where neither happens.
  const [openFilter, setOpenFilter] = useState<FilterField | null>(null);
  // Which way the submenu opens. Rightwards unless the window cannot take it.
  const [side, setSide] = useState<"right" | "left">("right");
  const t = useT();
  const language = useLanguage();

  function close(): void {
    setOpen(false);
    setOpenFilter(null);
    // Drop focus, or `group-focus-within` holds the panel open over the result
    // the reader just asked to see.
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  function choose(row: SortRow): void {
    onChange(nextSort(row, value));
    // A toggling row stays open: cycling through quickest, longest and off is
    // one decision made in two or three clicks, and closing the menu after each
    // would mean reopening it to change your mind.
    if (row.reverse === null) close();
  }

  /**
   * Opens a row's submenu, on the side there is room for.
   *
   * `row.filter` is null on the ordering rows, and writing that null is what
   * closes whichever submenu was open — one variable, so two of them can never
   * be open at once.
   */
  function reveal(row: SortRow, element: HTMLElement | null): void {
    if (row.filter && element) {
      const rect = element.getBoundingClientRect();
      // The submenu's own width plus a margin, before it exists to be measured.
      const needed = SUBMENU_WIDTH + 12;
      setSide(rect.right + needed <= window.innerWidth ? "right" : "left");
    }
    setOpenFilter(row.filter);
  }

  function pick(field: FilterField, next: string | null): void {
    onFilter(field, next);
    close();
  }

  /** The key this row is currently showing: its own state, or its primary. */
  const active = (row: SortRow): SortKey =>
    value === row.primary || value === row.reverse ? value : row.primary;

  const isActive = (row: SortRow): boolean =>
    value === row.primary || value === row.reverse;

  const label = (name: string): string =>
    name === UNATTRIBUTED_SHELF ? t("unattributed") : translateCategory(language, name);

  return (
    <div
      className="group relative"
      onMouseLeave={() => {
        setOpen(false);
        setOpenFilter(null);
      }}
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        // Same as the language menu below it: the name says what the control
        // is, the word says what it is set to.
        aria-label={t("sortLabel")}
        // Plain text, like the language menu in the footer. A bordered box here
        // read as a second input sitting beside the search field, which is what
        // it looked like and is not what it is: the search field takes typing,
        // this one only opens a list.
        className="px-2 py-2 text-sm text-text-muted hover:text-text"
      >
        {t(SORT_STRING_KEYS[value])}
        <Arrow sort={value} />
      </button>

      <div
        role="menu"
        className="absolute top-full right-0 z-30 hidden min-w-44 pt-1 group-hover:block group-focus-within:block group-data-open:block"
      >
        <ul className="flex flex-col rounded-card border border-border bg-surface py-1 shadow-lg">
          {SORT_ROWS.map((row) => {
            const shown = active(row);
            const on = isActive(row);
            const filtered = row.filter ? filters[row.filter] : null;

            return (
              <li
                key={row.primary}
                className="relative"
                // Hover and focus both set which submenu is open — including to
                // `null` on a row that has none, which is what closes the one
                // before it.
                onMouseEnter={(event) => reveal(row, event.currentTarget)}
                onFocus={(event) => reveal(row, event.currentTarget)}
              >
                <div className="flex items-stretch">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => choose(row)}
                    className={`flex-1 px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                      on ? "text-accent" : "text-text-muted"
                    }`}
                  >
                    {t(SORT_STRING_KEYS[shown])}
                    {on ? <Arrow sort={shown} /> : null}
                  </button>

                  {/* The submenu opens on hover for a pointer, but a tap has to
                      reach it too — and a tap on the row itself means "group by
                      this". So the disclosure is its own target. */}
                  {row.filter ? (
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openFilter === row.filter}
                      aria-label={`${t(SORT_STRING_KEYS[row.primary])}: ${t("filterShowAll")}`}
                      onClick={(event) => {
                        if (openFilter === row.filter) setOpenFilter(null);
                        else reveal(row, event.currentTarget.closest("li"));
                      }}
                      className={`px-2 text-xs hover:bg-surface-2 ${
                        filtered ? "text-accent" : "text-text-muted"
                      }`}
                    >
                      ▸
                    </button>
                  ) : null}
                </div>

                {row.filter && openFilter === row.filter ? (
                  <div
                    role="menu"
                    // Padding rather than a margin on the facing side: it keeps
                    // the pointer inside the row while it crosses the gap, and a
                    // margin would let the submenu close underneath it.
                    className={`absolute top-0 z-40 ${
                      side === "right" ? "left-full pl-1" : "right-full pr-1"
                    }`}
                    style={{ width: SUBMENU_WIDTH }}
                  >
                    <ul className="flex max-h-72 flex-col overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-lg">
                      <li>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={filtered === null}
                          onClick={() => pick(row.filter as FilterField, null)}
                          className={`w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                            filtered === null ? "text-accent" : "text-text-muted"
                          }`}
                        >
                          {t("filterShowAll")}
                        </button>
                      </li>
                      {options[row.filter].map((option) => (
                        <li key={option.value}>
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={filtered === option.value}
                            onClick={() => pick(row.filter as FilterField, option.value)}
                            className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                              filtered === option.value
                                ? "text-accent"
                                : "text-text-muted"
                            }`}
                          >
                            <span>{label(option.value)}</span>
                            <span className="numeric text-xs text-text-muted">
                              {option.count}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Which way the ordering runs.
 *
 * A glyph rather than a word: it sits inside a row that already names the
 * ordering, and "A–Z ascending" says the same thing twice. `aria-hidden`
 * for the same reason — the label beside it already reads "A–Z" or "Quickest
 * first", which is the direction in words.
 */
/**
 * How wide a submenu is.
 *
 * Fixed, and set here rather than by its contents, because the side it opens on
 * has to be decided *before* it is rendered — a menu that measured itself would
 * have to appear on the wrong side first.
 */
const SUBMENU_WIDTH = 176;

function Arrow({ sort }: { sort: SortKey }) {
  const direction = SORT_DIRECTIONS[sort];
  if (!direction) return null;
  return (
    <span aria-hidden="true" className="ml-1 text-xs">
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

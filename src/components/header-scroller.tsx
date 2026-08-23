"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The header row, as a scroller with edges that say so.
 *
 * The navigation is the collection's own shape, so it grows as the collection
 * does: ten shelves fit a wide window today, and the eleventh will not. The row
 * has always scrolled sideways rather than wrapping — a category pushed onto a
 * second line reads as an afterthought rather than a peer — but a scrollbar is
 * a poor way to say so. On a phone it is invisible until you already know to
 * swipe, and on a desktop it is a grey trough sitting under the one row of the
 * page that is otherwise nothing but words and rules.
 *
 * So the trough goes, and two things take its place:
 *
 * A fade at whichever edge has more behind it. The links do not stop at a hard
 * clip, they dissolve into the page, which is the oldest way there is of saying
 * "this continues". It costs nothing, needs no explanation, and it is as true
 * on a phone as on a desktop.
 *
 * And an arrow, but only where the fade is not enough. Someone reading on a
 * phone swipes without being asked; someone on a trackpad flicks two fingers.
 * Someone on a plain mouse has neither gesture — a wheel scrolls the page, not
 * the row — so for them, and only for them, the fade carries a button. The
 * `(hover: hover) and (pointer: fine)` test in the stylesheet is what draws
 * that line, and it draws it by input device rather than by screen width, which
 * is the thing that actually differs.
 */
export function HeaderScroller({ children }: { children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [reach, setReach] = useState({ left: false, right: false });

  /**
   * How much is hidden on each side.
   *
   * The one-pixel tolerance is not superstition: `scrollWidth` and `scrollLeft`
   * are fractional on a zoomed or fractionally-scaled display, so an exact
   * comparison leaves a fade permanently lit at the end of a row that has
   * nowhere further to go.
   */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const hidden = el.scrollWidth - el.clientWidth;
    setReach({ left: el.scrollLeft > 1, right: el.scrollLeft < hidden - 1 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    measure();

    // Three separate things change the answer, and only one of them is a
    // window resize: the row's own contents can change width when the language
    // changes (a category is a different length in every language), and the
    // whole row reflows when the webfont lands and every word in it stops being
    // Georgia. Observing the scroller and its children covers the first two.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    // And the third: `swap` means the row is laid out twice on a cold visit.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => observer.disconnect();
  }, [measure]);

  /**
   * A page in the given direction.
   *
   * Eight tenths of the visible width rather than all of it, so the link you
   * were looking at when you clicked is still on screen afterwards. A jump that
   * lands entirely new content leaves you with no idea where you are.
   */
  const page = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: still ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={measure}
        // nowrap + scroll: at phone width the link set is wider than the
        // viewport, and wrapping pushed the last link onto its own line.
        className="scroll-row flex items-center gap-4 overflow-x-auto px-4 py-4 whitespace-nowrap sm:px-6"
      >
        {children}
      </div>
      <Edge side="left" lit={reach.left} onClick={() => page(-1)} />
      <Edge side="right" lit={reach.right} onClick={() => page(1)} />
    </div>
  );
}

/**
 * One end of the row: the fade, and the arrow that sits in it.
 *
 * Both are rendered at all times and faded rather than mounted and unmounted,
 * so arriving at the end of the row is a dimming rather than a control
 * vanishing out from under the pointer that was about to click it. `lit` is
 * also what disables the button, so the invisible one cannot be clicked.
 *
 * The whole thing is `aria-hidden`, and the button is out of the tab order.
 * That is deliberate rather than an oversight: a keyboard tabbing through the
 * links scrolls them into view natively, one at a time, and a screen reader
 * reads the whole row regardless of what is painted. Neither has anything to
 * gain from a control whose entire job is to move a viewport a mouse cannot
 * move — announcing it would add two buttons to a row of ten links to no end.
 */
function Edge({
  side,
  lit,
  onClick,
}: {
  side: "left" | "right";
  lit: boolean;
  onClick: () => void;
}) {
  const left = side === "left";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex items-center transition-opacity duration-150 ${
        left ? "left-0 justify-start" : "right-0 justify-end"
      } ${lit ? "opacity-100" : "opacity-0"}`}
    >
      <div
        className={`absolute inset-y-0 w-16 ${
          left ? "scroll-fade-left left-0" : "scroll-fade-right right-0"
        }`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={!lit}
        onClick={onClick}
        className={`pointer-only pointer-events-auto relative h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-sm text-text-muted hover:text-accent ${
          left ? "ml-1" : "mr-1"
        }`}
      >
        {left ? "‹" : "›"}
      </button>
    </div>
  );
}

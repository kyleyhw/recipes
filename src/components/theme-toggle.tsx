"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/components/language";

/**
 * Switching between the light and dark palettes.
 *
 * Light is the default: the tokens on bare `:root` are the light ones, and dark
 * is applied by stamping `data-theme="dark"` on the root element. A choice is
 * remembered in `localStorage`, so the site opens the way you left it.
 *
 * ## Why `useSyncExternalStore` rather than state in an effect
 *
 * The current theme is not React's to own — it lives on the document element,
 * put there by an inline script that runs before React exists. Mirroring it
 * into `useState` inside an effect means rendering the wrong label for one
 * frame and re-rendering to correct it, which is both a visible flicker and the
 * thing `react-hooks/set-state-in-effect` exists to prevent.
 *
 * Reading it as an external store instead is exactly what that hook is for: the
 * server snapshot is "light" because that is what the markup is generated as,
 * and the client snapshot reads the attribute the inline script already set. No
 * effect, no flicker, no mismatch.
 */

const STORAGE_KEY = "recipes.theme";

type Theme = "dark" | "light";

/** Subscribers, notified when the toggle changes the attribute. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** Light, because that is the palette the prerendered markup is generated with. */
function getServerSnapshot(): Theme {
  return "light";
}

function choose(next: Theme): void {
  // The attribute is the single switch: `globals.css` keys the dark palette
  // off it, and nothing else needs to know.
  if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");

  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing, or storage disabled. The theme still changes for this
    // page; it simply will not be remembered, which is better than throwing.
  }

  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = useT();

  return (
    <button
      type="button"
      onClick={() => choose(theme === "dark" ? "light" : "dark")}
      className="hover:text-text"
      aria-label={theme === "dark" ? t("toLight") : t("toDark")}
    >
      {theme === "dark" ? t("light") : t("dark")}
    </button>
  );
}

/**
 * Applies the remembered choice before the page paints.
 *
 * Rendered as an inline script in the document head. Without it the page paints
 * light, then React mounts and switches to dark — a flash of white on every
 * navigation for anyone who chose dark, which is exactly the reader most
 * bothered by one.
 *
 * Deliberately tiny and dependency-free: it runs before anything else on the
 * page, and it swallows its own errors because a failure here would leave the
 * site unstyled rather than merely on the wrong theme.
 */
export const themeScript = `(function(){try{if(localStorage.getItem("${STORAGE_KEY}")==="dark"){document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})()`;

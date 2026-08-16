"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  isLanguage,
  LANGUAGES,
  translate,
  translateCategory,
  type Language,
  type StringKey,
} from "@/lib/i18n/strings";

/**
 * Choosing the interface language.
 *
 * The same shape as the theme, and for the same reason: the choice lives on the
 * document element, an inline script applies it before paint, and React reads
 * it as an external store rather than mirroring it into state inside an effect.
 *
 * ## The one honest caveat
 *
 * This is a static site. Every page is generated once, at build time, in
 * English, and the language is applied in the browser afterwards — so a reader
 * who has chosen Russian sees English for the instant between first paint and
 * hydration. Serving four prerendered copies of the site under `/ru/…` would
 * remove that, at the cost of quadrupling the build and putting the language in
 * the URL. For a personal collection read by one person on their own phone, the
 * flicker is the cheaper problem, and it is written down here so the trade is a
 * decision rather than an accident.
 *
 * `getServerSnapshot` returns English deliberately: React uses it for the
 * hydration render as well as on the server, which is what keeps the two in
 * agreement. The re-render to the stored language happens immediately after.
 */

const STORAGE_KEY = "recipes.language";
const ATTRIBUTE = "data-lang";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Language {
  const value = document.documentElement.getAttribute(ATTRIBUTE);
  return isLanguage(value) ? value : "en";
}

/** English, because that is what the prerendered markup is generated in. */
function getServerSnapshot(): Language {
  return "en";
}

function choose(next: Language): void {
  document.documentElement.setAttribute(ATTRIBUTE, next);
  // The real `lang` attribute matters beyond this component: it is what a
  // screen reader uses to pick a voice, and what a browser uses to offer a
  // translation. It is set here rather than in the pre-paint script because
  // React rendered it, and rewriting a rendered attribute before hydration is
  // how you get a mismatch warning on every page load.
  document.documentElement.lang = next;

  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing, or storage disabled. The language still changes for
    // this page; it simply will not be remembered.
  }

  for (const listener of listeners) listener();
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Keeps `<html lang>` honest.
 *
 * Renders nothing. The pre-paint script cannot set `lang` without tripping a
 * hydration mismatch, and `choose` only runs when someone picks a language —
 * so on a return visit the attribute would still say English while the page
 * says Russian. This closes that gap one tick after hydration, which is the
 * earliest it can be closed safely.
 *
 * An effect is the right tool here and not a smell: it synchronises with
 * something outside React, and writes no state.
 */
export function LanguageDocumentSync() {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}

/** The translator, bound to the current language. */
export function useT(): (
  key: StringKey,
  vars?: Record<string, string | number>,
) => string {
  const language = useLanguage();
  return (key, vars) => translate(language, key, vars);
}

/**
 * One translated string, as an element.
 *
 * This exists so that a *server* component can hold a translated word without
 * becoming a client component itself. Server components cannot subscribe to
 * anything, but they can render one of these, and each is its own subscriber.
 * Attributes — placeholders, labels, titles — cannot be done this way, so
 * components with those use `useT` and are client components already.
 */
export function T({
  k,
  vars,
  labelTranslations,
}: {
  k: StringKey;
  vars?: Record<string, string | number>;
  /**
   * Translations for the `label` variable, keyed by language.
   *
   * "60 min bake" has a word in it that belongs to the recipe rather than to
   * the string table — the verb for its cooking time — so the sentence comes
   * from the table and the word inside it comes from the translation file.
   */
  labelTranslations?: Record<string, string | null | undefined>;
}) {
  const language = useLanguage();
  const resolved =
    labelTranslations?.[language] && vars
      ? { ...vars, label: labelTranslations[language] as string }
      : vars;
  return <>{translate(language, k, resolved)}</>;
}

/** A category name, translated where this collection's own table knows it. */
export function TCategory({ name }: { name: string }) {
  const language = useLanguage();
  return <>{translateCategory(language, name)}</>;
}

/**
 * The language menu.
 *
 * Plain text, not a button in a box: it sits in the footer beside the theme,
 * which is also plain text, and a bordered control there would be the loudest
 * thing on a page whose subject is a recipe. Opens on hover, on keyboard focus
 * and on tap, for the reasons set out in `sort-menu.tsx` — and it drops
 * *upward*, because there is nothing below the footer to drop into.
 */
export function LanguageMenu() {
  const language = useLanguage();

  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="menu"
        // The accessible name says what the control is; the visible word says
        // what it is currently set to. Without the label it would announce
        // itself as "Русский", which is a value, not a control.
        aria-label={translate(language, "language")}
        lang={language}
        className="hover:text-text"
        // Clicking the word does nothing on its own: the menu is the control,
        // and this is here so a keyboard can reach it and a tap can open it.
        onClick={(event) => event.preventDefault()}
      >
        {LANGUAGES.find((entry) => entry.code === language)?.label ??
          translate(language, "language")}
      </button>

      <div
        role="menu"
        className="absolute right-0 bottom-full z-30 hidden min-w-36 pb-1 group-hover:block group-focus-within:block"
      >
        <ul className="flex flex-col rounded-card border border-border bg-surface py-1 shadow-lg">
          {LANGUAGES.map((entry) => (
            <li key={entry.code}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={entry.code === language}
                lang={entry.code}
                onClick={() => {
                  choose(entry.code);
                  (document.activeElement as HTMLElement | null)?.blur();
                }}
                className={`w-full px-3 py-1.5 text-left whitespace-nowrap hover:bg-surface-2 ${
                  entry.code === language ? "text-accent" : "text-text-muted"
                }`}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Applies the remembered language before the page paints.
 *
 * Only `data-lang`, never `lang`: the second is rendered by the layout, and
 * changing a rendered attribute before React hydrates produces a mismatch on
 * every load. `choose` sets it once we are past hydration, and this script's
 * job is only to make the stored choice readable by `getSnapshot`.
 */
export const languageScript = `(function(){try{var l=localStorage.getItem("${STORAGE_KEY}");if(l){document.documentElement.setAttribute("${ATTRIBUTE}",l)}}catch(e){}})()`;

/**
 * A piece of recipe content, in the reader's language.
 *
 * The interface has a string table; a recipe does not. Its title and its notes
 * are content — the same words, said again by `scripts/translate.ts` and
 * committed as a file — so this takes the English and a map of the alternatives
 * rather than a key.
 *
 * Falls back to English per field. A translation that has a title but no
 * storage section shows a translated title and English storage, which is
 * visibly incomplete rather than silently missing.
 */
export function TContent({
  en,
  translated,
}: {
  en: string;
  translated: Record<string, string | null | undefined>;
}) {
  const language = useLanguage();
  return <>{translated[language] || en}</>;
}

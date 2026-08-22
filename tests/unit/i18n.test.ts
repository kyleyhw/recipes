import { describe, expect, it } from "vitest";
import {
  DICTIONARIES,
  isLanguage,
  LANGUAGE_CODES,
  LANGUAGES,
  translate,
  translateCategory,
  type Language,
  type StringKey,
} from "@/lib/i18n/strings";

/**
 * Tests for the string tables.
 *
 * TypeScript already guarantees that every language has every key — the other
 * tables are typed against the English one. What it cannot see is a value that
 * is empty, or a translation that dropped the `{n}` its original carried, and
 * both of those produce a sentence with a hole in it in exactly one language on
 * exactly one screen. That is what these check.
 */

const KEYS = Object.keys(DICTIONARIES.en) as StringKey[];
const OTHERS = LANGUAGE_CODES.filter((code) => code !== "en");

/** The `{name}` slots a string expects, as a set. */
function placeholders(text: string): Set<string> {
  return new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string));
}

describe("the tables", () => {
  it.each(LANGUAGE_CODES)("has a non-empty value for every key in %s", (code) => {
    for (const key of KEYS) {
      expect(DICTIONARIES[code][key].trim(), `${code}.${key}`).not.toBe("");
    }
  });

  /**
   * The load-bearing one. `resultsFor` without its `{n}` renders as a sentence
   * missing its number, which reads as a bug in the search rather than a gap in
   * a translation — and nobody who does not read that language will ever see it.
   */
  it.each(OTHERS)("keeps every placeholder the English original has, in %s", (code) => {
    for (const key of KEYS) {
      const expected = placeholders(DICTIONARIES.en[key]);
      const actual = placeholders(DICTIONARIES[code][key]);
      expect([...actual].sort(), `${code}.${key}`).toEqual([...expected].sort());
    }
  });

  it("offers a label for every language it lists", () => {
    for (const entry of LANGUAGES) {
      expect(entry.label.trim()).not.toBe("");
    }
    expect(new Set(LANGUAGE_CODES).size).toBe(LANGUAGES.length);
  });

  /**
   * The labels are endonyms — each written in its own language — so none of
   * them should be the English name of the language.
   */
  it("names each language in its own script", () => {
    const labels = LANGUAGES.map((l) => l.label);
    expect(labels).toContain("Русский");
    expect(labels).not.toContain("Russian");
  });
});

describe("interpolation", () => {
  it("fills placeholders", () => {
    expect(translate("en", "minPrep", { d: "20 min" })).toBe("20 min prep");
  });

  it("fills the same placeholders in every language", () => {
    for (const code of LANGUAGE_CODES) {
      const text = translate(code, "lowerBound", { n: 42 });
      expect(text, code).toContain("42");
      expect(text, code).not.toContain("{");
    }
  });

  /** An unfilled slot must not leave `{n}` on the screen. */
  it("empties a placeholder it was given nothing for", () => {
    expect(translate("en", "minPrep")).not.toContain("{");
  });

  it("pluralises English on the count", () => {
    expect(translate("en", "gapNoQuantity", { n: 1 })).toContain("ingredient with");
    expect(translate("en", "gapNoQuantity", { n: 3 })).toContain("ingredients with");
  });

  /**
   * Chinese has no plural inflection and Russian has three forms on a rule this
   * table does not implement, so those strings are written to read correctly
   * without one. None of them may contain the English plural marker.
   */
  it.each(OTHERS)("leaves no English plural marker in %s", (code) => {
    for (const key of KEYS) {
      expect(DICTIONARIES[code][key], `${code}.${key}`).not.toContain("(s)");
    }
  });
});

describe("categories", () => {
  it("translates a category the collection ships with", () => {
    expect(translateCategory("ru", "Baked Goods")).toBe("Выпечка");
    expect(translateCategory("zh-Hant", "Mains")).toBe("主菜");
  });

  /**
   * A category invented after this table was written must show its own name,
   * not the literal key and not an empty navigation item.
   */
  it("falls back to the name for a category it does not know", () => {
    expect(translateCategory("ru", "Pickles")).toBe("Pickles");
  });
});

describe("recognising a stored value", () => {
  it("accepts the codes it offers", () => {
    for (const code of LANGUAGE_CODES) expect(isLanguage(code)).toBe(true);
  });

  /** localStorage is not trustworthy input: it survives across versions. */
  it("rejects anything else", () => {
    expect(isLanguage("klingon")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage("")).toBe(false);
  });

  it("falls back to English for a language with a gap", () => {
    // Not reachable through the type, but reachable through bad data.
    expect(translate("de" as Language, "method")).toBe("Method");
  });
});

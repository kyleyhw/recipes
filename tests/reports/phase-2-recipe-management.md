# Test report — Phase 2: Recipe management

**Date:** 2026-08-10
**Scope:** ingredient parsing, recipe CRUD, categories, tags, full-text search, URL and
paste import.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Unit tests (`vitest run`, 68 tests, 4 files) | 0.79 s |
| CRUD + search browser flow (13 assertions) | ~14 s |
| Import browser flow (13 assertions) | ~16 s |

---

## 1. Unit tests

### 1.1 `ingredient-parser.test.ts` — 38 tests

**Why.** The parser feeds scaling (phase 4) and macro resolution (phase 5). A silent
mis-parse there propagates into numbers the user is asked to trust, so the parser is
tested against the notations that actually occur rather than against tidy synthetic
strings.

**Input selection.** Quantity notations were chosen to cover the forms recipes really
use: mixed numbers (`1 1/2`) and vulgar fractions (`½`, `1½`) dominate baking, ranges
(`2-3`, `2 to 3`, `4–6`) dominate seasoning and produce, and en-dash ranges specifically
because they survive copy-and-paste from the web where a hyphen would not.

Two decisions are pinned by tests because they are judgement calls, not obvious facts:

- **Ranges resolve to the midpoint**, not the lower bound. The value feeds macro
  computation, where the midpoint is the better estimator. The original text is retained
  in `rawText`, so nothing is lost.
- **An absent quantity is `null`, not `0`.** Zero is a quantity: it would contribute
  nothing to macros while looking like a real measurement. `null` is the honest value and
  routes the ingredient into the coverage gap instead.

**Unscalable detection** (`to taste`, `for frying`, `as needed`, `to serve`) is tested
directly, since these are exactly the lines where multiplying by α produces confident
nonsense.

**Defect found.** `"-"` alone parsed to an empty name: the list-marker strip consumed the
whole line, and the fallback only reached back as far as the stripped string. Fixed by
extending the fallback chain to the trimmed original. An unnamed row is unusable in the
interface, whereas a noisy one is merely ugly.

### 1.2 `jsonld-import.test.ts` — 23 tests

**Why.** schema.org permits nearly every field to be a string, an object, or an array of
either, and real sites exercise all three. A parser tested only against the tidy case
fails on most of the web, so the fixtures reproduce the envelope shapes sites actually
emit.

**Input selection, and what each case defends against:**

| Fixture | Defends against |
| --- | --- |
| `@graph` with Organization and BreadcrumbList siblings | The most common real envelope (WordPress recipe plugins); a parser assuming a top-level Recipe finds nothing |
| `@type: ["Recipe", "NewsArticle"]` | Multi-typed nodes, where a `===` comparison fails |
| `HowToSection` wrapping `HowToStep` | Recipes with sub-sections ("For the sauce"), where a flat read loses every step |
| `recipeInstructions` as one HTML blob | Sites that emit `<ol><li>…`; splitting on periods would shatter "180 C." and "1 lb." |
| Malformed JSON-LD block followed by a valid one | Pages carrying several blocks where only one is broken; aborting the scan would lose a recipe that is present and valid |
| 200-level nested document | The recursion depth limit |

**Defect found.** `recipeYield` as a bare JSON number (`6`) returned `null`, because the
string reader rejects non-strings. schema.org types the field as Text *or* Integer and
sites emit both. Caught by the browser flow as well as the unit test, and fixed by
handling the numeric case before the text path.

---

## 2. Browser verification

Against real PostgreSQL, Chromium at 390 × 844.

### 2.1 CRUD and search — 13 assertions

All passed. Notable coverage:

| Assertion | Why it matters |
| --- | --- |
| `rawText` preserved verbatim on the page | The whole retention argument of the data model |
| Ingredient-only search (`harissa`) finds the recipe | Ingredients never appear in titles; a title-only search would miss the most useful query |
| Unbalanced quote (`?q="unbalanced`) returns 200 | `websearch_to_tsquery` tolerates it where `to_tsquery` raises a syntax error, turning a stray quotation mark into a 500 |
| Retitling re-slugs the recipe | Slug uniqueness on update, excluding the recipe's own id |
| Only non-empty category shelves render | Nine empty shelves would bury the collection |

**Harness defect, not a product defect.** The first run selected
`button[type=submit]`, which also matches the header's "Sign out" button; the test signed
itself out and reported a create failure. Diagnosed from the server log line
`<inline action>() in 10ms src/app/(owner)/layout.tsx`, which named the action that
actually ran. Fixed with specific selectors. Recorded because the failure looked
identical to a broken Server Action.

### 2.2 Import — 13 assertions

All passed, against a locally-served fixture page carrying a realistic `@graph` envelope.

Verified: title, yield from a bare number, both ISO-8601 durations, five ingredient lines,
`HowToStep` flattening, DRAFT status on import, the draft badge, the unscalable flag on
"Salt to taste", graceful failure on an unfetchable URL, and the paste path splitting on a
"Method" heading and dropping the heading itself.

**Design point verified rather than assumed:** imported recipes are saved as `DRAFT` and
opened in the editor rather than saved silently. The extraction is good but not
guaranteed, and the category is a guess.

---

## 3. Not covered

- **The URL importer has been exercised only against a synthetic fixture**, not against
  live recipe sites. The fixture reproduces the shapes seen in the wild, but real sites
  will produce variations this has not met.
- **No test covers concurrent edits** to the same recipe. Single-owner deployment makes
  this unlikely rather than impossible (two phones), and last-write-wins is the current
  behaviour.
- **The paste importer's heuristic split** (first long line with no quantity) is tested
  only via the "Method" heading path in the browser and not across a range of real pasted
  formats. Claude covers this case properly in phase 7.

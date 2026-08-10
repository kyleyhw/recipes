# Test report — Phase 3: Photos

**Date:** 2026-08-10
**Scope:** image storage, validation, re-encoding, `og:image` ingest, manual upload,
deterministic placeholder.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Placeholder unit tests (7 tests) | 0.49 s |
| Photo browser flow (9 assertions) | ~25 s |

---

## 1. Unit tests — `photo-placeholder.test.ts`

**Why.** Determinism is the entire value of the placeholder: a recipe must look the same
in a listing as on its own page, across reloads and devices. A random gradient would make
the collection feel unstable and defeat visual recognition. Determinism is also what makes
server rendering safe — a value differing between server and client is a hydration
mismatch.

**What was tested, and why those inputs:**

| Test | Input choice |
| --- | --- |
| Same seed, same gradient | The core property |
| Four real slugs produce four distinct gradients | Not a universal claim — a 32-bit hash collides eventually — but these specific slugs must be distinguishable |
| Lightness within 0.45–0.68 across **2000** seeds | The category glyph is white; an unconstrained hash would occasionally produce a near-white card on which it is invisible. 2000 seeds rather than a handful because the failure is a rare tail, not a typical case |
| Chroma within 0.06–0.12 across 2000 seeds | Keeps placeholders visually quieter than real photographs sitting beside them in the grid |
| Hue within [0, 360) | Guards the modulo |
| Empty, non-ASCII, and 10 000-character seeds | Guards against `NaN` reaching the CSS: browsers drop `oklch(NaN …)` silently, leaving a transparent box rather than an obvious error |

All 7 passed.

## 2. Browser verification — 9 assertions

Against real PostgreSQL and a locally-served fixture site, Chromium at 390 × 844.

| Assertion | Result |
| --- | --- |
| Layer 1: `og:image` ingested during URL import, hero renders a stored image | PASS |
| Stored as a WebP hero rendition | PASS |
| Resized to the 1400 px hero width (1600×1200 → 1400×1050) | PASS |
| Attribution credits the source host, linked | PASS |
| Card rendition stored alongside the hero | PASS |
| Layer 3: upload overrides the automatic result and drops the credit | PASS |
| 200×150 image refused as too small, with a stated reason | PASS |
| 3000×700 banner refused on aspect ratio | PASS |
| Removing the photo falls back to the placeholder, never an empty slot | PASS |

**Fixture rationale.** Three images were generated rather than downloaded, so each targets
exactly one validation rule: 1600×1200 (valid, and large enough that the resize is
observable), 200×150 (fails the 600 px short-edge minimum), 3000×700 (passes the size
check with a 700 px short edge but fails the 2.5 aspect maximum). The third had to be
regenerated during testing: the first attempt at 2000×300 never reached the aspect check,
because a 300 px short edge is caught by the size check first. A fixture that cannot reach
the rule it is meant to exercise is a silently useless test.

## 3. Failures found

**Two were mine, in the test harness, and both initially looked like product bugs:**

1. `waitForSelector('input[type=file]')` timed out because it waits for *visibility* by
   default, and the file input is deliberately `hidden` (a styled label triggers it).
   `setInputFiles` works on hidden inputs; the wait does not. Fixed with
   `{ state: 'attached' }`.
2. An attribution assertion failed because a re-run created `roast-squash-soup-2` while
   the assertions still targeted the first run's recipe, which by then carried an upload
   and no credit. The credit was correct throughout — confirmed by querying the database
   directly rather than trusting the assertion. The test now clears state first.

**One was a real design issue caught by the type checker**, not by a test: setting a
nullable Prisma JSON column to `null` requires `Prisma.DbNull` (SQL NULL) rather than
`null`, which Prisma reads as the JSON value `null`. Silently storing JSON `null` would
have made "no attribution" indistinguishable from "attribution is literally null".

## 4. Not covered

- **Vercel Blob has never been exercised.** All verification used the local filesystem
  backend. The two backends share an interface but not a code path, and the blob path is
  unrun.
- **No test asserts the re-encode strips EXIF.** It does so as a consequence of decoding
  and re-emitting through sharp, but that is reasoned rather than verified.
- **Layer 2 (Claude web search) does not exist yet**; it lands in phase 7 on top of this
  pipeline, which is why phase 3 deliberately shipped only the free deterministic layers.

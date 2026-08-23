# Project Development Plan

This document outlines the planned phases and tasks for developing the recipe management
application. Status tags are updated as work completes.

Design rationale for the whole system is in [`docs/`](docs/index.md). The derivations
behind scaling and nutrition live in the modules that implement them —
`lib/quantity.ts`, `lib/scaling.ts` and `lib/nutrition/compute.ts` — which are pure
functions with the reasoning in their own comments.

---

## Phase 1: Foundations

1. [completed] Repository standards established before the initial commit.
   - [completed] `.gitignore` covering `.env*`, `.DS_Store`, `node_modules/`, `venv/`, `.venv/`
   - [completed] `.pre-commit-config.yaml` running prettier, eslint, tsc, and `detect-secrets`
   - [completed] `.secrets.baseline` generated and committed
2. [completed] Next.js + TypeScript + Tailwind scaffold with strict compiler settings.
   - [completed] `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
   - [completed] ESLint `no-explicit-any` as an error; Prettier for formatting
3. [completed] Prisma schema covering all seven phases in a single migration.
   - [completed] Migration generated offline via `prisma migrate diff` (no server required)
   - [completed] Hand-added full-text and trigram indexes not expressible in the schema
   - [completed] Category seed script, idempotent by slug
4. [completed] Single-owner authentication.
   - [completed] scrypt password hashing with embedded cost parameters
   - [completed] Sealed session cookie via iron-session
   - [completed] `src/proxy.ts` gate with three public prefixes
5. [completed] Local development database (PGlite) so a clone needs no Docker or Postgres.
6. [completed] Deployment configuration for Vercel + Neon.
7. [completed] Verification: 7 unit tests, 9-point browser flow against a real database.

## Phase 2: Recipe management

8. [completed] Recipe CRUD with free-text ingredient parsing.
   - [completed] Deterministic parser: mixed numbers, vulgar fractions, ranges, units
   - [completed] Unscalable-line detection ("to taste", "for frying")
   - [completed] Editor round-trips ingredients and steps as plain text
9. [completed] Category browse shelves and full-text search.
   - [completed] `websearch_to_tsquery` over recipe prose and ingredient lines
   - [completed] Relevance ranking, title weighted above ingredients
10. [completed] Tags, created on demand and matched case-insensitively.
11. [completed] Paste/URL import.
    - [completed] schema.org JSON-LD extraction — deterministic, needs no API key
    - [completed] Handles `@graph` envelopes, `HowToSection` nesting, HTML blobs
    - [completed] Imports land in the editor as drafts for review

## Phase 3: Photos

12. [completed] Storage pipeline: fetch, validate, resize, WebP, store.
    - [completed] Two backends — Vercel Blob when configured, local filesystem otherwise
    - [completed] Validation: size ceiling, 600px short edge, aspect band
    - [completed] Content-addressed keys, so a repeated image is stored once
13. [completed] Layer 1 — `og:image` ingested during URL import, with attribution.
14. [completed] Layer 3 — manual upload, overriding any automatic result.
15. [completed] Layer 4 — deterministic gradient placeholder keyed by slug.
16. [completed] Card and hero rendering at two stored sizes.

## Phase 3a: Memories

16a. [completed] Standing owner preferences injected into every Claude prompt.
    - [completed] `Memory` model and second migration
    - [completed] Seeded built-ins: strong flavours; unambiguous, direct steps
    - [completed] Editable list at `/memories`; built-ins editable but not deletable
    - [completed] `memoriesPromptFragment()` ready for the phase-7 prompts

## Phase 4: Portion scaling

17. [completed] `units.ts` — conversion factors, dimensions, and measurement systems.
    - [completed] Star-shaped lookup rather than a conversion graph
    - [completed] Cross-dimension conversion returns null, never a default
18. [completed] `quantity.ts` — constrained rational approximation and unit selection.
    - [completed] Search over D = {1,2,3,4,6,8}; continued fractions rejected with reason
    - [completed] Never crosses measurement systems; metric renders decimals
    - [completed] Comfortable range, then simplest denominator, ties to the larger unit
19. [completed] `scaling.ts` — pure scaling with `scalable: false` passthrough.
20. [completed] Servings stepper (URL-driven) and non-linearity advisories.
    - [completed] Threshold on |ln alpha|, so halving and doubling are treated alike
    - [completed] Leavening, yeast, salt, setting agents, chilli; pan size; cook time
    - [completed] Fractional egg counts explained rather than rounded

## Phase 5: Macros and export

21. [completed] USDA FoodData Central client (unexercised — no key available).
22. [completed] Ingredient resolution: exact, then trigram, then USDA, cached locally.
23. [completed] Aggregation and mass coverage.
    - [completed] Scaling invariant asserted at four factors and in the running system
    - [completed] Coverage mass-weighted; undeterminable mass reported separately
    - [completed] Unresolved ingredients never presented as nutritionally zero
24. [completed] Ingredient library UI with permanent manual override.
    - [completed] 22 seeded ingredients so macros work with no USDA key
    - [completed] Edits marked MANUAL and never overwritten automatically
25. [completed] Exports: JSON, schema.org JSON-LD, CSV, tracker text — all honour ?servings=N.

## Phase 6: Sharing

26. [completed] Versioned portable bundle format with migration support.
    - [completed] Carries resolved USDA ids and macro snapshots, so import is instant
    - [completed] Categories and tags travel as names, not identifiers
    - [completed] Newer bundles import with unknown fields ignored
27. [completed] Share links and the public read-only page.
    - [completed] 128-bit unguessable share ids, separate from the primary key
    - [completed] Full working recipe: scaling, advisories, macro panel
    - [completed] Revocation invalidates every circulated link immediately
28. [completed] Cross-instance import over the CORS-enabled public API.
29. [completed] File bundle import/export and whole-collection backup.

## Phase 7: Claude integration

30. [completed] Client, schemas, usage logging, and monthly spend ceiling.
    - [completed] One entry point (`callWithTool`) owning the ceiling, logging, validation, and failure
    - [completed] Tool definitions generated from zod schemas, in the strict subset
    - [completed] One correction attempt on a malformed or missing answer
    - [completed] Every response priced and recorded, including unusable ones
    - [completed] Ceiling checked from recorded spend before any request is made
    - [completed] Failure returned as data; nothing throws
31. [completed] Layer 2 photo sourcing via web search.
    - [completed] Search capped at two uses; candidates validated by the phase-3 ingest pipeline
    - [completed] Runner-up candidates stored, so replacing a photo costs nothing
32. [completed] Ingredient substitution with preview diff.
    - [completed] Edits matched against the stored recipe; an unmatched edit is reported, never applied
    - [completed] Preview is editable before it is applied; applying marks the recipe a draft
33. [completed] Recipe generation saved as drafts.
    - [completed] From a brief, from ingredients on hand, or against a per-serving energy target
    - [completed] Memories injected into every recipe-writing prompt
    - [completed] Photograph sourced in the same request
34. [completed] Claude-assisted USDA matching and text/URL import.
    - [completed] Choice among USDA candidates, plus the rho and mu that FDC does not record
    - [completed] Model estimate when FoodData Central has no record, stored as `source: CLAUDE`
    - [completed] Extraction from prose for pages with no structured data
35. [completed] Verification: 63 new unit tests, 37 browser assertions across three flows.
    - [completed] Degradation with no key: every AI control absent, everything else working
    - [completed] Failure paths exercised against the real API with an invalid key
    - [completed] Spend ceiling proven to refuse *before* spending, in 167 ms
    - [completed] Untested surface recorded explicitly in the phase-7 report

## Phase 8: Provenance, the recipe log, and history

36. [completed] The original source is recorded and shown for web-sourced recipes.
    - [completed] Captured on URL import, Claude extraction, and now on paste
    - [completed] Displayed as the site's name under the title, linking to the full address
    - [completed] Shown on the public share page; already carried by the bundle and both exports
    - [completed] Part of every revision snapshot, so a restore cannot detach it
37. [completed] A per-recipe log of notes and messages.
    - [completed] Closed by default; one quiet line on the recipe page, opened via `?chat=1`
    - [completed] **Note it** records a note with no model call and no cost
    - [completed] **Ask Claude** sends the message and applies whatever should change
    - [completed] The message is written to the log *before* the call, so a failure never costs the cook their words
    - [completed] Notes are deletable; the revisions they produced are not
38. [completed] Revision history with complete snapshots.
    - [completed] Snapshots, not diffs: any version is restorable on its own
    - [completed] A baseline `INITIAL` revision captures the state before a recipe's first recorded change
    - [completed] Recorded for chat revisions, hand edits, applied substitutions, and restores
    - [completed] Displayed as a longest-common-subsequence diff against the previous version
    - [completed] Restoring writes a new revision rather than deleting later ones
39. [completed] Desktop and mobile layout.
    - [completed] Recipe centred and primary; the log becomes a second column only when opened
    - [completed] Verified at 390, 768, and 1440 px with no horizontal overflow anywhere
40. [completed] Verification: 39 new unit tests, 43 browser assertions across three flows.
    - [completed] Diff round-trip property: kept+removed reconstructs the old, kept+added the new
    - [completed] Full edit → history → restore cycle against real Postgres
    - [completed] A failed model call still records the cook's message and records no version

## Phase 9: The static site

41. [completed] Recipe files as the source of truth.
    - [completed] `content/recipes/<slug>.md` — YAML front matter for data, Markdown
      lists for ingredients and method, so the file renders as a recipe on GitHub with
      no tooling and changing one quantity is a one-line diff
    - [completed] Serialising is byte-stable, so saving an unchanged recipe produces no
      diff and the history stays meaningful
    - [completed] `content/ingredients.json` holds the shared library and
      `content/categories.json` the shelves, so a wrong figure now shows up in review
    - [completed] Loading collects failures rather than throwing, and the content tests
      run against the real directory: a file that does not parse fails CI instead of
      going quietly missing from the site
42. [completed] The static export, and the server layer it withdrew.
    - [completed] `STATIC_EXPORT=1 next build` produces an `out/` of plain HTML — no
      server, no database, no session
    - [completed] Withdrawn with the server they needed: Postgres and Prisma, the Server
      Actions, the session gate and `src/proxy.ts`, the API routes, share links, and the
      server-side Claude client. Phases 1 and 3a to 8 above are the record of what was
      built, not of what runs today; the code is in the git history
    - [completed] Unchanged, because they were written as pure functions over plain data:
      units, quantity, scaling, macro aggregation and coverage, the ingredient parser,
      the export formats. That is why this cost an adapter rather than a rewrite
    - [completed] Serving count moved from URL state to React state; the page still
      renders complete without JavaScript at the recipe's own serving count
    - [completed] Search is a client-side scan over an index embedded in the page, with
      the collection size at which that stops being affordable written down
    - [completed] Exports are generated at build time, so they no longer honour
      `?servings=N`; per-serving macros are invariant under scaling, so a tracker reads
      the same figures either way
    - [completed] History and editing are the file's git history and GitHub's own edit
      form, linked from every recipe — which is what the format bought
    - [completed] One real bug found in the browser: `computeNutrition` divides by
      servings × scale and was being handed the target count as well, quietly breaking
      the per-serving invariant the moment anyone touched the stepper
43. [completed] Deployment from this repository.
    - [completed] A Pages workflow builds, runs the tests and deploys on a push;
      `PAGES_BASE_PATH` carries the `/<repo>` prefix a project page needs
    - [completed] A Check workflow runs the full check and a build on pull requests,
      since a fork cannot trigger the deploy
    - [completed] README reduced to a quickstart; the design document it had been is in
      `docs/`, where it already was

## Phase 10: The collection and the reading interface

44. [completed] Theme, typeface and page furniture.
    - [completed] The bone palette as one design read twice: the bone that is paper in
      light becomes the ink in dark, and only the clay accent is adjusted. Light is the
      default, and an inline script applies a remembered dark choice before first paint
    - [completed] Source Serif 4 self-hosted through `next/font/local` — two 50 kB
      variable woff2 files, no third party. A stylesheet `url()` does not pick up the
      Pages base path and would 404 on the deployed site; `next/font` rewrites it
    - [completed] Theme and language live in the footer: both are set once and never
      touched again, so neither belongs beside the things used on every visit
    - [completed] Favicon redrawn as a knife and fork in the site's own two colours,
      as `src/app/icon.svg`
45. [completed] Browsing: shelves, arranging, filtering.
    - [completed] A real page per category at `/category/<slug>`, generated at build, so
      a shelf can be sent to somebody and opened without JavaScript; empty categories are
      not offered at all
    - [completed] One Sort control rather than "group by" and "sort by" — category and
      cuisine group into shelves, A–Z, quickest, longest and most protein order a list
    - [completed] Orderings toggle direction in place; a recipe with nothing to sort by
      goes last in *both* directions, because an unknown figure is not an extreme
    - [completed] Every comparison falls back to the title, so the order is total across
      every render and every build
    - [completed] Protein per serving computed at build into the listing summary, shown
      on the card when that sort is active, with coverage beside it below 90%
    - [completed] Filters for cuisine and for who added it, over the values the
      collection actually contains, with counts; an active filter shows as a chip that
      clears with a click
    - [completed] The ingredient library moves to a drawer, closed by default;
      `/ingredients` stays, because a drawer cannot be linked to
46. [completed] Scaling by the tin you own.
    - [completed] A tin holds V = A h, so at constant depth A′ = αA and every linear
      dimension grows as √α: a doubled cake wants a tin 1.41× wider, not 2×
    - [completed] The inverse is the question a cook actually has — this is the tin I
      own, how much do I make? — and it is the same relation read the other way
    - [completed] Choosing a tin sets the serving count rather than being a second scale,
      and the stepper clears the tin, so the two controls cannot disagree
    - [completed] The picker asks by shape, then only the measurements that shape has;
      depth is asked for, stays out of α, and feeds the advisory instead
    - [completed] The new bake time is deliberately not computed: a cake is not a
      semi-infinite slab, and a figure here would be fabricated precision
    - [completed] The two directions are tested as an identity against each other, so
      neither needs hand-computed values to be trusted
47. [completed] Twenty nutrients, and coverage read per nutrient.
    - [completed] Saturates, cholesterol, potassium, calcium, iron, magnesium, zinc and
      vitamins A, C, D, E, B12 and folate, each against the EU reference intake
    - [completed] One table in `lib/nutrition/nutrients.ts` drives the library schema,
      the aggregation, the panel and every export, so a nutrient is a row of data rather
      than an edit in eleven files
    - [completed] Coverage is per nutrient over the same denominator: a recipe can be
      fully covered and still draw its zinc from a third of its mass, and zero coverage
      with a zero total stays distinguishable from a genuine zero
    - [completed] JSON-LD carries only what schema.org actually defines, rather than
      inventing properties that would validate and no importer reads
48. [completed] Waiting counted as time.
    - [completed] `waitMinutes` and `waitLabel` — the fridge, the prove, the marinade,
      the twelve hours of drying. Twelve recipes carry one
    - [completed] Every listing, the recipe page, the JSON-LD `totalTime` and the
      quickest/longest sorts count all three stretches; a pudding no longer advertises
      twenty minutes and take four and a half hours
    - [completed] Durations print in hours past sixty minutes, and stay exact: the parts
      and the total sit on one line, so a rounded total is an error a reader can check
    - [completed] Only waiting that actually makes you wait counts — a marinade that runs
      while the rice simmers stays in the method
49. [completed] The diagram.
    - [completed] The Cooking For Engineers table: ingredients down the left, operations
      flowing right. A method is a tree, and a numbered list flattens it into a sequence
      the reader has to rebuild
    - [completed] An indented list under `## Diagram` is the whole grammar — a line with
      children is an operation, a line without is an ingredient
    - [completed] A leaf matching an ingredient becomes that ingredient by index, so it
      shows the scaled quantity and the translated name without knowing either exists
    - [completed] A share of an ingredient is stored as a fraction (`1/3 peanut oil`) and
      rendered as what that comes to at the current scale; `validateDiagram` checks the
      shares of one ingredient add up to it
    - [completed] Eight rules in [`docs/diagram.md`](docs/diagram.md), including rule 8,
      which was written wrong and is corrected in the document rather than quietly fixed
    - [completed] The tests catch a missing diagram, a forgotten ingredient and shares
      that do not sum; they cannot catch row order or a sequence collapsed into one node,
      so the instruction is to render it and look
50. [completed] Four languages, translated at build time.
    - [completed] Interface strings in `lib/i18n`, with the English table as the shape of
      the type, so a missing translation is a compile error rather than a word that stays
      English on one screen
    - [completed] Recipe translations are produced by `npm run translate` and committed: a
      static site has nowhere to hold a key, the site works with no key at all, and a
      committed translation lands in a diff where somebody who reads Russian can fix it
    - [completed] Each file records a `sourceHash` of the English it was made from, so a
      run re-translates only what changed and never overwrites a hand correction
    - [completed] A translation carries ingredient *names*, not lines — the quantity is a
      number this application multiplies, and a line with the amount written into it
      would be right at ten slices and quietly wrong at fifteen
    - [completed] Names must line up with the base recipe one for one, or the file is
      rejected with its count reported; nothing structural lives in a translation
    - [completed] Titles are translated in listings, and every translation is in the
      search haystack
51. [completed] Attribution taken from the git history.
    - [completed] The name comes from the commit that added the file rather than a field,
      so there is nothing to fill in and nothing that can drift; later editors are
      credited beneath the author, and a translation counts as an edit
    - [completed] The Pages workflow fetches the whole history, and a shallow clone shows
      nothing rather than crediting whoever pushed last — a gap is visible, a wrong name
      is not
    - [completed] `users.noreply` addresses are read for a GitHub handle and never
      emitted; no handle means an unlinked name, not a guessed profile
52. [completed] Storage, for the dish and for the rest of the cabbage.
    - [completed] `## Storage` is its own section in the file format, read on the second
      day when the only question is how to bring the thing back
    - [completed] 81 of the 136 library rows carry a `keeping` note — a place, a time,
      and the trick that actually extends it. It lives on the ingredient because ginger is in ten
      recipes, and ten copies are ten things to keep in step
    - [completed] The notes join the recipe's own Storage section rather than sitting in a
      drawer elsewhere; the tests reject a note under forty characters
53. [completed] A recipe links wherever another one names it.
    - [completed] Matched from the title rather than from syntax, so a file stays readable
      as plain text on GitHub, in an editor, or printed
    - [completed] Case-sensitive and longest-title-first, so a description stays a
      description and a title that prefixes another cannot misdirect
    - [completed] Whitespace-insensitive, which the tests found the hard way: the notes
      are hard-wrapped at eighty characters, and a plain string search silently dropped
      every reference that straddled a line break
    - [completed] A test checks the shipped collection's own cross-references still
      resolve, which is what breaks the day a recipe is renamed
54. [completed] The collection itself: 47 recipes over nine shelves and eleven cuisines.
    - [completed] Grown from real published recipes, credited in the front matter, with
      what was changed and why in each recipe's Log
    - [completed] 136 ingredient rows, and a test fails on a row no recipe uses: every row
      is a sourced claim somebody has to keep true, and one nothing uses is a claim nobody
      will ever check
    - [completed] The rows carrying the most weight in a panel verified against published
      figures rather than trusted — and guanciale recorded as checked, because the
      English-language aggregators confidently give it pancetta's composition
    - [completed] Shell-on and bone-in ingredients hold meat figures times an edible
      yield, since a recipe states them by the weight you buy
    - [completed] Cantonese split out of Chinese, once 25 recipes were filed under one
      word doing the work of two cuisines
55. [completed] Contribution documents.
    - [completed] `CONTRIBUTING.md` written for handing the job to a model, because the
      format asks for numbered temperatures, a storage section, a library row per
      ingredient and a diagram with a grammar — and then names the part that does not
      delegate
    - [completed] [`docs/contributing-by-hand.md`](docs/contributing-by-hand.md) is the
      same ground for a person typing it: every field, the ingredient line grammar, a
      worked library row
    - [completed] `docs/mathematics.md` dropped and its twenty-one references rewritten;
      the derivations already sit in the modules they constrain, which is the copy that
      cannot drift
    - [completed] Memories move to `content/memories.md`, since phase 9 took away both
      the database that held them and the prompt they were injected into. They are a
      file like everything else, so changing a preference is a commit
56. [completed] The header navigation at full width.
    - [completed] Full-bleed rather than capped at the reading column: a reading column is
      capped because a long line of method is hard to track back from, and navigation is
      scanned rather than read
    - [completed] The row scrolls sideways rather than wrapping, and now says so itself —
      a fade at whichever edge is hiding something, in place of a scrollbar that was
      invisible on a phone and a grey trough on a desktop
    - [completed] An arrow inside the fade only under `(hover: hover) and (pointer: fine)`,
      because the input device is what differs: a touch screen swipes and a trackpad
      flicks, and a plain mouse has neither gesture
    - [completed] Both edges stay mounted and fade rather than being added and removed, so
      reaching the end of the row dims a control instead of pulling it out from under the
      pointer; they are `aria-hidden` and out of the tab order
    - [completed] Even spacing was tried and reverted: dealing the slack out between every
      link and rule pulled each shelf away from the rules that group it, until ten
      shelves read as ten unrelated words

## Phase 11: Generated photographs

57. [completed] `scripts/photos.ts` upgraded for Nano Banana Pro and the Batch API.
    - [completed] `gemini-3-pro-image` by default; native 16:9 at 1K; model-named credit line
    - [completed] `--batch` / `--harvest`: identical images at half price via the Batch API
    - [completed] `--max-spend` ceiling integrated with the batch rate ($5 default passes a
      $3.15 batch run and stops a $6.30 interactive one)
58. [completed] Key hygiene verified end to end.
    - [completed] `.env` gitignored and never in any commit (checked against full history);
      re-encoded UTF-16 → UTF-8 so Node's `loadEnvFile` actually reads it
    - [completed] `uvx pre-commit install` run, so the hooks fire on this clone
    - [completed] Canary test: `no-api-keys.sh` catches Google- and Anthropic-shaped keys in
      all three tried forms; detect-secrets alone caught only the quoted form
    - [completed] GitHub secret scanning and push protection enabled on the repository
59. [completed] Generate all 47 card photos with Nano Banana Pro (2026-08-23).
    - [completed] One interactive proof image first ($0.13), validating billing and the
      request shape before committing the rest
    - [completed] The other 46 as a single Batch API job: three minutes, zero failures,
      $3.08 at the half-price batch rate — $3.22 total against the August credit
    - [completed] Every file 39–149 kB, inside the 512 kB commit ceiling; spot-checked
      visually, including the six steamed pork patties, which came out distinct
      as the description-and-final-step prompt design intended
60. [completed] Key locality and the photo-add guard.
    - [completed] Policy recorded in script and docs: the key never leaves the owner's
      machine — request headers to Google only, no CI secrets, no other services
    - [completed] photos.ts now skips any photo without a prompt fingerprint, so a
      photograph added by hand is never drawn over (the cleared fingerprint
      previously marked the recipe *due*, the opposite of the documented promise)
    - [completed] Nano Banana 2 and 2 Lite priced in, so the spend ceiling can
      price them rather than refusing to run

---

## Status

All eleven phases are complete. What runs is a static site built from the files
in `content/`: 47 recipes over nine shelves and eleven cuisines, each carrying a
generated photograph credited as such, in four interface languages, deployed
from this repository by the Pages workflow. 438 unit tests pass in 20 files.

Phases 1 and 3a to 8 describe an application with a server, and phase 9
withdrew it — Postgres, the sessions, share links and the whole Claude layer
went with the re-platform to GitHub Pages. Those entries stay as the record of
what was built and why; item 42 says what became of each part. The phase
reports in [`tests/reports/`](tests/reports) stop at phase 8 for the same
reason: phases 9 to 11 are recorded in [`docs/`](docs/index.md) and in the
commit history instead.

Complete is not the same as finished — what is still open is listed below. The
gap recorded in
[`tests/reports/phase-7-claude.md`](tests/reports/phase-7-claude.md) §6 — no
Anthropic API key, so nothing downstream of a successful model response was
ever exercised — is history for the code phase 9 withdrew, and still live for
the one place a key is still called for: `npm run translate`, which is why
item 1 below is open.

---

## Still open

Not phases, and none of them block anything. They are here because otherwise
they live only in somebody's memory of a conversation, which is the one place
this repository has consistently refused to keep things.

1. [pending] **Translations for 45 of the 47 recipes.** Only banana bread and
   the mussels spaghetti have them; every other recipe falls back to English in
   the three non-English languages, field by field, which is visibly incomplete
   rather than wrong. `npm run translate` does it and needs an
   `ANTHROPIC_API_KEY`, which no machine this has run on has had.

2. [pending] **Thirty ingredient rows are not USDA-sourced.** Listed by
   `content/ingredients.json`'s `source: MANUAL`. Most are genuinely absent from
   USDA — zha cai, doubanjiang, lap cheung, hot pot base paste, preserved egg —
   and their notes say where the figures came from instead. A handful could be
   upgraded: rice vinegar, msg, baby corn, bicarbonate of soda, savoiardi,
   marsala, dark soy sauce. Verify against the record rather than an aggregator:
   guanciale was nearly corrected to pancetta's composition by a summary that
   confidently averaged the wrong food.

3. [pending] **No `LICENSE` file.** The repository is public and has none, so
   strictly nobody may reuse any of it. Recipes are not copyrightable as such;
   the prose, photographs and code are.

4. [pending] **`OFL.txt` is missing from `src/app/fonts/`.** The font is
   redistributed under the SIL Open Font License, which requires the licence to
   travel with it. [`NOTICE.md`](src/app/fonts/NOTICE.md) in that directory says
   so and is explicit that it is not itself a substitute for the file.

5. [pending] **The ginger scallion oil photograph shows charred flecks.** The
   dish is raw ginger and scallion with hot oil poured over; nothing in it
   should look scorched. One image to redraw — see
   [`docs/photos.md`](docs/photos.md) — and worth adding "nothing browned or
   charred" to that prompt if it recurs.

6. [pending] **Three modules left behind by the re-platform are unreferenced.**
   `src/components/servings-stepper.tsx` (the recipe page has its own stepper
   inline), `src/lib/ai/schemas.ts`, and `src/lib/memories-data.ts` — whose own
   comment explains that it is kept importable by `prisma/seed.ts`, a file phase
   9 deleted. Nothing imports any of them. `src/lib/ai/pricing.ts` and
   `src/lib/ai/diff.ts` are the near case: reached by their tests and by no
   production code. This is the fault commit 2fc0c88 removed
   `starter-ingredients.ts` for — a second stale copy of something is the one
   that gets read by mistake.

7. [shelved] **AI substitutions and the on-page chat box.** Designed and costed
   in [`docs/claude-integration.md`](docs/claude-integration.md), then shelved
   deliberately. The blocker is structural rather than technical: a static site
   has nowhere to hold a key, so it needs a proxy — a Cloudflare Worker was the
   recommendation — before any of it can ship.

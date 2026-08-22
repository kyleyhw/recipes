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

## Phase 9: Generated photographs (static site)

41. [completed] `scripts/photos.ts` upgraded for Nano Banana Pro and the Batch API.
    - [completed] `gemini-3-pro-image` by default; native 16:9 at 1K; model-named credit line
    - [completed] `--batch` / `--harvest`: identical images at half price via the Batch API
    - [completed] `--max-spend` ceiling integrated with the batch rate ($5 default passes a
      $3.15 batch run and stops a $6.30 interactive one)
42. [completed] Key hygiene verified end to end.
    - [completed] `.env` gitignored and never in any commit (checked against full history);
      re-encoded UTF-16 → UTF-8 so Node's `loadEnvFile` actually reads it
    - [completed] `uvx pre-commit install` run, so the hooks fire on this clone
    - [completed] Canary test: `no-api-keys.sh` catches Google- and Anthropic-shaped keys in
      all three tried forms; detect-secrets alone caught only the quoted form
    - [completed] GitHub secret scanning and push protection enabled on the repository
43. [pending] Generate all 47 card photos: `npm run photos -- --batch` (~$3.15).
    - Blocked on billing: the key's project is on the free tier and the image models
      have no free tier (429, quota 0, verified 2026-08-22). Attach billing — the
      Google AI Pro credits then cover the run until they lapse at the end of
      August 2026.

---

## Status

Phases 1–8 are complete. Phase 9 waits on billing being attached to the
Gemini key's project; everything up to the paid call is built and tested. The one substantial gap in verification is
recorded in [`tests/reports/phase-7-claude.md`](tests/reports/phase-7-claude.md)
§6 and restated in the phase 8 report: no Anthropic API key was available, so
nothing downstream of a successful model response — including the recipe
revision this phase adds — has been exercised against the live service.

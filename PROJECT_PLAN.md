# Project Development Plan

This document outlines the planned phases and tasks for developing the recipe management
application. Status tags are updated as work completes.

Design rationale for the whole system is in [`docs/`](docs/index.md); the mathematical
derivations underpinning scaling and nutrition are in
[`docs/mathematics.md`](docs/mathematics.md).

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

30. [pending] Client, schemas, usage logging, and monthly spend ceiling.
31. [pending] Layer 2 photo sourcing via web search.
32. [pending] Ingredient substitution with preview diff.
33. [pending] Recipe generation saved as drafts.
34. [pending] Claude-assisted USDA matching and text/URL import.

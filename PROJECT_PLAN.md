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

17. [pending] `units.ts` — conversion factor table and dimension handling.
18. [pending] `quantity.ts` — constrained rational approximation and unit selection.
19. [pending] `scaling.ts` — pure scaling with `scalable: false` passthrough.
20. [pending] Servings stepper and non-linearity advisories.

## Phase 5: Macros and export

21. [pending] USDA FoodData Central client.
22. [pending] Ingredient resolution against the canonical library.
23. [pending] Aggregation and mass coverage.
24. [pending] Ingredient library UI with permanent manual override.
25. [pending] Exports: JSON, Schema.org JSON-LD, CSV, tracker clipboard format.

## Phase 6: Sharing

26. [pending] Versioned portable bundle format with migration support.
27. [pending] Share links and the public read-only page.
28. [pending] Cross-instance import over the public API.
29. [pending] File bundle import/export and whole-collection backup.

## Phase 7: Claude integration

30. [pending] Client, schemas, usage logging, and monthly spend ceiling.
31. [pending] Layer 2 photo sourcing via web search.
32. [pending] Ingredient substitution with preview diff.
33. [pending] Recipe generation saved as drafts.
34. [pending] Claude-assisted USDA matching and text/URL import.

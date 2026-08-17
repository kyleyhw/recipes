# Architecture

## Shape

A single Next.js application (App Router). Server Components read; Route
Handlers mutate and serve exports. There is no separate backend: the Anthropic
and USDA keys live in server-side modules that a client bundle cannot import,
enforced by `import "server-only"` at the top of each.

```
Request
   |
   v
src/proxy.ts ........... session gate; three public prefixes bypass it
   |
   +-- /login ................. sign in (Server Action)
   +-- /r/[shareId] ........... public read-only recipe
   +-- /api/public/* .......... public bundle API (CORS)
   |
   v
src/app/(owner)/* ...... everything else, behind the password
   |
   v
src/lib/* .............. domain logic
   |
   +-- pure core: units, quantity, scaling, nutrition/compute, sharing/bundle
   +-- effectful:  db, auth, env, nutrition/usda, photos/*, ai/*
```

## The pure core

Five modules are pure functions over plain data, with no database access, no
network access, and no clock:

| Module | Responsibility |
| --- | --- |
| `lib/units.ts` | Conversion factors, dimensions, cross-dimension conversion |
| `lib/quantity.ts` | Rendering a magnitude as a usable kitchen measurement |
| `lib/scaling.ts` | `scale(recipe, α) -> recipe` |
| `lib/nutrition/compute.ts` | Macro aggregation and mass coverage |
| `lib/sharing/bundle.ts` | Serialise, parse, validate, migrate the portable format |

This split is deliberate rather than stylistic. These modules carry all of the
application's mathematical content and therefore essentially all of its
correctness risk; the rest is CRUD, whose
failure modes are visible on sight. Purity means they are tested directly, with
no fixtures, no mocking, and no running Postgres — which in turn means the
tests are cheap enough to be exhaustive where it matters.

## Toolchain mapping

The project's global standards specify a Python toolchain. This project is
TypeScript, so each rule is honoured by its closest equivalent rather than its
literal instrument:

| Standard (Python) | Here |
| --- | --- |
| `uv` project workflow | `npm` with a committed `package-lock.json` |
| `ruff` lint + format | ESLint (`@typescript-eslint`) + Prettier |
| `ty`, error-on-warning | `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters` |
| No implicit `Any` | `strict` covers implicit; ESLint `no-explicit-any` covers explicit |
| Precise types over loose | zod schemas as the single source of truth for external data, with TypeScript types *inferred* from them rather than declared twice |
| Boundary leniency for unstubbed libraries | Casts permitted only at third-party boundaries, each with a comment stating why |
| `detect-secrets` pre-commit | Unchanged — language-agnostic |

One limitation is worth stating rather than glossing: TypeScript's `strict`
does not prohibit *explicit* `any`, and no compiler flag requires annotation
completeness on inferred return types. ESLint enforces the first; the second
rests on discipline. This is the same gap the standards document identifies in
`ty`, and it is not papered over here.

### Boundary casts

Two casts exist in the codebase, both at third-party boundaries, both
commented in place:

1. `lib/auth.ts` — Next's `ReadonlyRequestCookies` and iron-session's
   unexported `CookieStore` describe the same runtime object but declare their
   `set` overloads differently with respect to `| undefined`. Under
   `exactOptionalPropertyTypes` these are distinct types. `as never` is used
   rather than restating the interface, because a local copy would drift
   silently if the library changed.
2. `lib/db.ts` — the global singleton cache, which is the standard Prisma
   pattern for surviving Next's development-mode module reloading.

## Runtime notes

**Prisma 7 requires a driver adapter.** The connection URL is no longer
declared in `schema.prisma`; it reaches the CLI through `prisma.config.ts` and
the client through `@prisma/adapter-pg`. That adapter speaks the standard
PostgreSQL wire protocol, so the same code path serves local development and
Neon in production — Neon's pooled endpoint is an ordinary Postgres endpoint.
Using one adapter for both removes a class of bug where local and deployed
behaviour diverge.

**Migrations are generated offline.** `prisma migrate diff --from-empty
--to-schema` produces the SQL without connecting to anything, so the schema can
be developed with no database running. `prisma migrate deploy` applies it
during the Vercel build.

**Expression indexes are hand-written.** Prisma cannot declare them, so the
full-text and trigram indexes are appended to the initial migration by hand.
The two-argument `to_tsvector('english', ...)` form is used because it is
`IMMUTABLE` and therefore indexable; the one-argument form depends on a session
setting and is not.

**The proxy duplicates two constants.** `src/proxy.ts` runs in the edge
runtime and cannot import `lib/auth.ts` (which pulls in `server-only` and
`node:crypto`), so it restates the session cookie name. The duplication is
pinned by `tests/unit/proxy-contract.test.ts`, because divergence would
redirect every request to the login page while the application believed the
user was signed in — a failure neither module would show in isolation.

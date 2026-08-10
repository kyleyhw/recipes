# Test report — Phase 1: Foundations

**Date:** 2026-08-10
**Scope:** repository standards, schema and migration, authentication, session gate,
deployment configuration.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Unit tests (`vitest run`, 7 tests, 2 files) | 0.73 s (transform 39 ms, import 93 ms, tests 489 ms) |
| Type check (`tsc --noEmit`) | ~4 s |
| Lint (`eslint`) | ~3 s |
| Browser flow (9 assertions, Chromium, 390 × 844) | ~11 s |
| Migration + seed against live PostgreSQL | ~2 s |

---

## 1. Unit tests

### 1.1 `tests/unit/auth-hash.test.ts` — password hash format

**What.** Four properties of the stored `OWNER_PASSWORD_HASH` encoding.

**Why.** These tests exist because of a defect found during phase-1 verification,
not as speculative coverage. The original implementation used the conventional
modular-crypt separator `$`, producing
`scrypt$32768$8$1$<salt>$<key>`. Next.js runs `dotenv-expand` over `.env` files,
which interprets `$32768` and `$8` as variable references and substitutes empty
strings for them. A 130-character hash was silently truncated to 79 characters,
and every login failed as "incorrect password" with nothing in any log to
explain why. The separator was changed to `:`, which lies outside the expansion
grammar.

**What was tested, and why those inputs:**

| Test | Input | Rationale for the input |
| --- | --- | --- |
| Contains no `$` | `"correct horse battery staple"` | The assertion targets the *character*, not the separator, because reintroducing `$` anywhere in the encoding — a future field, a different base — would reintroduce the truncation |
| Survives dotenv expansion | Same, then `replace(/\$\{?[A-Za-z0-9_]+\}?/g, "")` | Applies dotenv-expand's actual substitution rule to the output. A correct format makes this a no-op. This reproduces the original bug directly rather than testing a proxy for it |
| Self-describing | `"pw"` | Parameters must be recoverable from the string so that raising the scrypt cost later does not invalidate existing hashes. Asserts salt = 16 bytes, key = 64 bytes after base64 decoding |
| Independent salting | `"same"` hashed twice | Identical output would reveal that two deployments share a password |

**Note on method.** `src/lib/auth.ts` cannot be imported by the test: it begins
with `import "server-only"`, which throws outside a React Server Component, and
it imports the validated environment. The algorithm is therefore reproduced
against identical parameters, and the properties under test are the *format's*.
This is a real limitation — a change to `auth.ts` that diverged from the
reproduced algorithm would not be caught here — and is accepted because the
format, not the implementation, is what the dotenv defect concerned.

### 1.2 `tests/unit/proxy-contract.test.ts` — proxy/auth shared contract

**What.** Three properties of `src/proxy.ts` and its relationship to `src/lib/auth.ts`.

**Why.** The proxy runs in the edge runtime and cannot import `lib/auth.ts`,
which pulls in `server-only` and `node:crypto`. It therefore restates the
session cookie name. If the two diverge, every request is redirected to the
login page while the application believes the user is signed in — a failure
neither module exhibits in isolation, and which no other test would catch.

**What was tested, and why:**

| Test | Rationale |
| --- | --- |
| Cookie name matches in both modules | The divergence failure described above |
| Public prefixes are exactly `/login`, `/r/`, `/api/public/` | The public surface is a security boundary. Stating the intended set explicitly means widening it requires a deliberate edit to the test, not an unremarked constant change |
| API routes get 401, not a redirect | A redirect to an HTML login page is useless to a `fetch()` caller and makes a 401 look like a 200 with an unexpected body |

The sources are read as text rather than imported, for the same
`server-only` reason as above.

---

## 2. Integration verification

Executed against **real PostgreSQL** — PGlite, a genuine PostgreSQL build
compiled to WebAssembly, served over TCP via the actual wire protocol. Not an
emulation or an in-memory substitute: `pg_trgm`, GIN expression indexes, and
`prisma migrate deploy` all executed as they would on Neon.

### 2.1 Schema and migration

| Check | Result |
| --- | --- |
| `prisma migrate deploy` applies the initial migration | Applied |
| All 7 models plus the implicit join table created | `AiInteraction`, `Category`, `Ingredient`, `Recipe`, `RecipeIngredient`, `Step`, `Tag`, `_RecipeToTag` |
| `pg_trgm` extension created | Present |
| Hand-written expression indexes created | `Recipe_fts_idx`, `RecipeIngredient_fts_idx`, `Ingredient_name_trgm_idx` |
| Seed is idempotent by slug | 9 categories, correct `position` ordering |

The expression indexes are the reason this was verified against real Postgres
rather than assumed: `to_tsvector` is only indexable in its two-argument form,
and that constraint is invisible until the migration runs.

### 2.2 Browser flow (Chromium, 390 × 844 viewport)

All nine assertions passed.

| # | Assertion | Result |
| --- | --- | --- |
| 1 | Unauthenticated `/` redirects to `/login` | PASS |
| 2 | Wrong password issues no cookie | PASS |
| 3 | Wrong password shows an error | PASS |
| 4 | Correct password issues a session cookie | PASS |
| 5 | Collection page renders | PASS |
| 6 | All 9 seeded categories render | PASS |
| 7 | Session persists across navigation | PASS |
| 8 | Sign out clears the session | PASS |
| 9 | No horizontal overflow at 390 px | PASS |

Assertion 4 deliberately follows a *failed* attempt in the same session, since
that is the realistic retry path and was the sequence that first exposed the
hash defect.

Viewport 390 × 844 corresponds to a common phone; the application is used
one-handed at a kitchen counter, so phone width is the primary target rather
than a secondary check.

Also confirmed by inspection of the rendered page: the "Generate" navigation
link is **absent** when `ANTHROPIC_API_KEY` is unset, verifying that optional
capabilities degrade rather than break.

### 2.3 Non-obvious failures found and fixed

| Failure | Cause | Fix |
| --- | --- | --- |
| Every login rejected | dotenv-expand destroying the `$`-separated hash | Separator changed to `:`; regression test added |
| `Connection terminated unexpectedly` on page render | PGlite serves one connection at a time; the default pg pool opens several | `DB_POOL_MAX` added, documented, set to 1 for PGlite |
| `prisma migrate diff --to-schema-datamodel` rejected | Flag removed in Prisma 7 | Use `--to-schema` |
| `url` in `datasource` block rejected | Prisma 7 moved it to `prisma.config.ts` | Config file added; `process.env` used rather than Prisma's `env()`, which throws when unset and would block offline migration generation |

A test-harness artefact is worth recording separately, because it initially
looked like a product bug: the first browser script read `page.url()` after
`waitForLoadState('networkidle')`, which resolved *before* the client-side
navigation triggered by the Server Action's redirect. This reported a
successful login as a failure across several runs. The fix was `waitForURL`.
The lesson — that the harness must be eliminated as a suspect before the
application is — is why the response headers were captured directly
(`set-cookie`, `x-action-redirect`) rather than inferred from the final URL.

---

## 3. Not covered

Stated explicitly rather than left implicit:

- **No test asserts that `lib/auth.ts`'s own `hashPassword`/`verifyPassword`
  round-trip.** They cannot be imported outside a server context. The algorithm
  is exercised indirectly through the browser flow (assertions 2–4), which is
  weaker than a direct unit test.
- **No deployment to Vercel or Neon has been performed.** Both require
  credentials this environment does not hold. The build is verified
  (`next build` succeeds, `/` correctly resolves as dynamic) and the migration
  is verified against real Postgres, but the deployment path itself is
  unexercised.
- **The pure mathematical modules do not exist yet** (phases 4–5), so the
  scaling-invariant property test described in
  [`docs/mathematics.md §3`](../../docs/mathematics.md) is not yet present.

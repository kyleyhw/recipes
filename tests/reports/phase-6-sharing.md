# Test report — Phase 6: Sharing between instances

**Date:** 2026-08-10
**Scope:** portable bundle format, share links, the public page and API,
instance-to-instance import, file import, whole-collection backup.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Full unit suite (180 tests, 10 files) | ~1.6 s |
| `bundle.test.ts` (21 tests) | 11 ms |
| Sharing browser flow (21 assertions) | ~22 s |

---

## 1. `bundle.test.ts` — a format is a contract

A bundle is a contract between two pieces of software that may be at different
versions and may never communicate again, so the tests are about *compatibility*
as much as correctness.

| Test | What it defends |
| --- | --- |
| Round-trip preserves the document exactly | The baseline |
| Macro snapshot and USDA id survive | The load-bearing property: it is what lets an importing instance show correct nutrition with no key, no network call, and no model call — and what stops two instances computing different numbers for one recipe |
| ρ travels too | Without it, a cup measure is unconvertible on the far side and the recipe silently loses coverage |
| Categories and tags as names | Identifiers are meaningless across a boundary |
| An older bundle migrates | A bundle downloaded today must still import after the application moves on, or the file path is useless as backup |
| A **newer** bundle imports, ignoring unknown fields | Refusing an import we could largely honour is worse than dropping fields we do not understand |
| Six malformed inputs rejected with a message, never a throw | Malformed input is routine — a truncated download, a pasted fragment, the wrong file — and must be actionable, not an error page |
| `baseServings: 0` rejected | It is the denominator of the scaling factor; zero would make every scaled quantity infinite |
| The error names the offending field | "Not valid" is not actionable |
| A single bundle is not mistaken for a collection | Both arrive through the same file control, so the shapes must be distinguishable without guessing |

## 2. Browser verification — 21 assertions

All passed, using **two independent browser contexts**: the owner's, and a
logged-out stranger's. That separation is the point — the security claim is about
what someone *without* a session can and cannot reach, and testing it from the
owner's session would prove nothing.

### The security boundary

| Assertion | Result |
| --- | --- |
| Logged-out visitor reads `/r/<id>` with no redirect | PASS |
| The shared page carries the macro panel and scaling | PASS |
| The shared page exposes no owner controls (no Edit, no photo controls, no sign-out) | PASS |
| The visitor still cannot reach `/` — bounced to login | PASS |
| The public bundle endpoint is reachable without a session | PASS |
| Revoking sharing 404s the page **immediately** | PASS |
| …and the bundle endpoint in the same instant | PASS |

The share id is 22 base64url characters — 128 bits — so the public surface is
exactly the recipes the owner chose to share, not a guessable range.

### The round trip

The strongest evidence that the format works: a shared recipe was re-imported
through the share link, and its per-serving macros came back at **363.1 kcal
against 363.1**, with coverage identical to three decimal places — with no USDA
key configured and no re-resolution. Four ingredients carried resolved macro
snapshots across the boundary.

The imported copy is a `DRAFT`, not silently trusted.

## 3. Not covered

- **Both sides of the exchange were the same instance.** A second deployment was
  not stood up, so genuine cross-origin behaviour — real CORS enforcement, a
  different database, a different ingredient library with conflicting names — is
  untested. The CORS *header* is asserted; the browser enforcing it against a
  different origin is not.
- **`importedFrom` provenance is written but not displayed.** The imported
  recipe records where it came from; no interface surfaces it yet.
- **The photo does not travel.** The bundle carries an absolute `photoUrl` and
  its credit, but the importing instance does not fetch and re-store the image,
  so an imported recipe falls back to its placeholder. The field is present for
  a later phase to use.
- **No rate limiting on the public endpoint.** A share id is unguessable, so
  enumeration is impractical, but a circulated link could be fetched in a loop.

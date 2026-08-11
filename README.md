# Recipes

A personal recipe collection: storage, portion scaling, macronutrient
computation, Claude-assisted substitution and generation, per-recipe notes with
a full revision history, and sharing between independently-hosted instances.

Recipes taken from a website keep the address they came from. Cook one, find it
wants more butter, say so in its notes, and the recipe changes — with the reason
recorded beside the change and every earlier version one click away.

**This application does not track macro intake.** It computes and exposes
macros so they can be fed into whatever tracker you already use, which is why
export is a first-class interface rather than an afterthought.

Each deployment belongs to one person. Clone it, set three environment
variables, and you have your own — see [docs/self-hosting.md](docs/self-hosting.md).

---

## Documentation

| Document | Covers |
| --- | --- |
| [docs/index.md](docs/index.md) | Documentation hub |
| [docs/architecture.md](docs/architecture.md) | System shape, module boundaries, toolchain mapping |
| [docs/mathematics.md](docs/mathematics.md) | Unit conversion, rational approximation, macro aggregation |
| [docs/data-model.md](docs/data-model.md) | Schema and the reasoning behind each non-obvious column |
| [docs/self-hosting.md](docs/self-hosting.md) | Running your own instance |
| [docs/nutrition-pipeline.md](docs/nutrition-pipeline.md) | Ingredient resolution and reading the macro panel |
| [docs/sharing-format.md](docs/sharing-format.md) | The portable bundle and cross-instance import |
| [docs/claude-integration.md](docs/claude-integration.md) | The model features, the spend ceiling, and every failure mode |
| [docs/log-and-history.md](docs/log-and-history.md) | Per-recipe notes, revising by message, snapshots and restore |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Phase breakdown and current status |
| [tests/reports/](tests/reports/) | Test reports, with runtimes and input justifications |

---

## Structure

```
recipes/
├── PROJECT_PLAN.md            phase breakdown and status
├── prisma/
│   ├── schema.prisma          full schema; one migration covers all phases
│   ├── migrations/            generated offline via `prisma migrate diff`
│   └── seed.ts                default categories, idempotent by slug
├── prisma.config.ts           Prisma 7 CLI config (datasource lives here now)
├── scripts/
│   ├── setup.ts               prints SESSION_SECRET and OWNER_PASSWORD_HASH
│   └── dev-db.ts              PGlite: real Postgres over TCP, no Docker needed
├── src/
│   ├── proxy.ts               session gate; three public prefixes bypass it
│   ├── app/
│   │   ├── (owner)/           everything behind the password
│   │   ├── login/             sign in
│   │   ├── r/[shareId]/       public read-only recipe          [phase 6]
│   │   └── api/               mutations, exports, public bundle API
│   ├── components/
│   ├── generated/prisma/      generated client (gitignored)
│   └── lib/
│       ├── env.ts             validated environment; feature flags
│       ├── db.ts              Prisma singleton via the pg driver adapter
│       ├── auth.ts            scrypt hashing, sealed session cookie
│       ├── units.ts           conversion factors, dimensions        [phase 4]
│       ├── quantity.ts        kitchen-measurement rendering         [phase 4]
│       ├── scaling.ts         scale(recipe, α) -> recipe            [phase 4]
│       ├── nutrition/         USDA client, resolution, aggregation  [phase 5]
│       ├── sharing/           portable bundle format                [phase 6]
│       ├── photos/            sourcing, storage, placeholder        [phase 3]
│       ├── memories.ts        standing preferences, injected into prompts
│       ├── journal.ts         the per-recipe log and its revisions    [phase 8]
│       ├── snapshot.ts        the revision format; pure, so restorable
│       └── ai/                Claude client, schemas, features      [phase 7]
│           ├── client.ts      the one entry point: ceiling, logging, validation
│           ├── pricing.ts     model prices; pure, so the ceiling is testable
│           ├── schemas.ts     zod schemas -> tool definitions -> validation
│           └── diff.ts        applying a substitution; unmatched edits reported
├── tests/
│   ├── unit/                  pure-module tests
│   └── reports/               markdown test reports
└── docs/
```

---

## The parts with actual mathematics

Most of this application is CRUD. Three components are not, and they are
derived in full in [docs/mathematics.md](docs/mathematics.md).

### Unit conversion

Units partition by dimension, $U = U_m \sqcup U_v \sqcup U_c$ (mass, volume,
count). Within a dimension each unit $u$ carries a factor $\lambda_u$ to that
dimension's base, so a quantity $(q,u)$ has canonical magnitude
$\tilde q = q\lambda_u$ and conversion is the scalar map
$q \mapsto q\lambda_{u_1}/\lambda_{u_2}$. A lookup table suffices; no graph
search is involved.

Crossing dimensions is *not* a property of the unit but of the substance:
$m = \rho V$ for volume, $m = \mu n$ for count. Both $\rho$ and $\mu$ are
stored per ingredient. Where either is unknown the conversion is undefined, and
the ingredient is reported as a coverage gap rather than given a default.

### Rendering a scaled quantity

Scaling multiplies by $\alpha = S_\text{target}/S_\text{base}$. Rendering the
result usably is a rational approximation problem over the denominators
kitchen equipment actually realises,

$$D = \{1,2,3,4,6,8\},$$

minimising $|x - p/q|$ over $q \in D$, $p \in \mathbb{Z}_{>0}$, with ties broken
toward smaller $q$.

The textbook tool — continued fractions — is a trap here. Its convergents are
optimal over *all* denominators, which is the wrong feasible set: the best
convergent to $0.5385$ is $7/13$, and no measuring spoon realises thirteenths.
Restricting to $D$ makes the problem a six-candidate search, since for fixed
$q$ the optimal numerator is $p = \operatorname{round}(qx)$. The constrained
problem is strictly easier than the unconstrained one.

Scaling is applied only to extensive quantities. Chemical leavening, salt in
fermented doughs, and bake time scale sub-linearly; the application flags them
past a threshold in $|\log\alpha|$ rather than modelling them, which would be
fabricated precision.

### Macros and coverage

With resolved masses $g_i$ and per-100 g macro vectors $\mathbf{m}_i$,

$$\mathbf{M} = \sum_i \frac{g_i}{100}\mathbf{m}_i,
\qquad \mathbf{M}_\text{serving} = \frac{\mathbf{M}}{S}.$$

Under scaling, $g_i \mapsto \alpha g_i$ and $S \mapsto \alpha S$, so
$\mathbf{M}_\text{serving}$ is invariant. That exact identity is used as a
property test: it catches bugs in the scaling and aggregation paths without any
hand-computed expected values.

When ingredients fail to resolve, the honest report is **mass coverage**

$$c = \frac{\sum_{i \in R} g_i}{\sum_i g_i},$$

not a count of matched ingredients — counting weights a pinch of salt equally
with 500 g of flour.

---

## Development

```bash
npm install
cp .env.example .env && npm run setup     # then paste the printed values in
npm run db:dev                            # PGlite; no Docker required
npm run db:migrate && npm run db:seed
npm run dev
```

| Command | Does |
| --- | --- |
| `npm run check` | typecheck, lint, format check, tests |
| `npm test` | unit tests |
| `npm run db:studio` | browse the database |
| `uvx pre-commit install` | install the commit hooks |

Full setup and deployment: [docs/self-hosting.md](docs/self-hosting.md).

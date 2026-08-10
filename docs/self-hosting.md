# Self-hosting

Each deployment belongs to one person. Running your own copy takes a database,
two generated secrets, and a deploy.

## Local development

```bash
git clone https://github.com/kyleyhw/recipes.git
cd recipes
npm install

cp .env.example .env
npm run setup            # prints SESSION_SECRET and OWNER_PASSWORD_HASH
```

Paste the two printed values into `.env`. Then start the bundled database and
the application in separate terminals:

```bash
npm run db:dev           # PGlite on 127.0.0.1:5432, data in .pglite/
npm run db:migrate       # apply the schema
npm run db:seed          # create the default categories
npm run dev
```

`npm run db:dev` runs [PGlite](https://pglite.dev): a real PostgreSQL build
compiled to WebAssembly, exposed over TCP speaking the genuine wire protocol.
Migrations, extensions, full-text search, and trigram indexes all execute as
real Postgres rather than an emulation. It exists so that a fresh clone needs
neither Docker nor an installed PostgreSQL.

**Set `DB_POOL_MAX=1` when using it.** PGlite serves one connection at a time
and terminates the surplus, which surfaces as `Connection terminated
unexpectedly` on queries that are otherwise correct. `.env.example` documents
this; the default of 5 is intended for deployment.

## Deploying to Vercel + Neon

1. **Database.** Create a Neon project. Copy the **pooled** connection string
   — the host contains `-pooler`. Serverless functions open many short-lived
   connections and will exhaust a direct endpoint's limit.
2. **Secrets.** Run `npm run setup` locally and keep the output.
3. **Project.** Import the repository into Vercel. Set the build command to
   `npm run vercel-build`, which runs `prisma generate && prisma migrate deploy
   && next build` — migrations are applied automatically on every deploy.
4. **Environment variables.** Set `DATABASE_URL`, `SESSION_SECRET`, and
   `OWNER_PASSWORD_HASH` at minimum. Add the optional keys below for the
   features you want.
5. **Seed once.** After the first deploy, run `npm run db:seed` locally with
   `DATABASE_URL` pointing at the production database.

## Environment variables

Three are required. Every other key disables exactly one capability by its
absence, so a deployment with only the required three is a fully working recipe
box.

| Variable | Required | Absence means |
| --- | --- | --- |
| `DATABASE_URL` | yes | — |
| `SESSION_SECRET` | yes | — |
| `OWNER_PASSWORD_HASH` | yes | — |
| `ANTHROPIC_API_KEY` | no | Claude features hide themselves; photos fall back to `og:image` and upload |
| `USDA_API_KEY` | no | Macro lookup falls back to manual entry ([free key](https://fdc.nal.usda.gov/api-key-signup.html)) |
| `BLOB_READ_WRITE_TOKEN` | no | Photos fall back to the generated placeholder |
| `AI_MONTHLY_BUDGET_USD` | no | Defaults to 10 — see below |
| `DB_POOL_MAX` | no | Defaults to 5; set to 1 for PGlite |
| `APP_URL` | no | Inferred from Vercel; set to override |

### The spend ceiling

A deployed instance holds a live API key, so `AI_MONTHLY_BUDGET_USD` bounds what
it can spend in a calendar month (UTC). The figure is compared against this
deployment's own record of what it has spent — every call is priced at call time
and stored — so it needs no billing credentials and costs no network round trip.
Reaching it disables the Claude features with an explicit message and leaves
everything else working.

The default of 10 comfortably covers personal use: the expensive operation is
photo search at roughly two cents a recipe, and everything else is fractions of
a cent. It is a backstop against a runaway loop rather than a meaningful limit.
Current spend is displayed next to every button that can spend it.
[docs/claude-integration.md](claude-integration.md) has the pricing table.

### One trap worth knowing about

`OWNER_PASSWORD_HASH` is `:`-separated, not `$`-separated as the conventional
modular-crypt format would be. This is deliberate. Next.js runs `dotenv-expand`
over `.env` files, which reads `$32768` as a variable reference and substitutes
an empty string — silently truncating the hash and making every login fail as
"incorrect password" with nothing to explain why. Do not convert the separator
back. `tests/unit/auth-hash.test.ts` pins this.

## Authentication model

One password per deployment, hashed with scrypt (N = 2¹⁵, r = 8, p = 1) and
checked in constant time. A successful check seals a 30-day HTTP-only cookie.
There is no user table, no registration, and no password reset: to change the
password, regenerate the hash with `npm run setup` and redeploy. Changing
`SESSION_SECRET` invalidates every existing session.

`src/proxy.ts` gates every route except `/login`, `/r/[shareId]`, and
`/api/public/*` — the three surfaces that must work for a logged-out visitor
holding a share link. It verifies the cookie's cryptographic seal rather than
merely checking that a cookie exists, so the gate is authoritative on its own.

## Sharing between instances

Recipes move between separate deployments through a versioned portable bundle
rather than any database-level mechanism. See
[sharing-format.md](sharing-format.md).

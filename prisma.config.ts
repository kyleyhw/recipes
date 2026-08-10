import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 no longer accepts `url = env("DATABASE_URL")` inside
 * `schema.prisma`; the connection string reaches the CLI here, and reaches the
 * client at runtime through a driver adapter (see `src/lib/db.ts`).
 *
 * Prisma 7 also no longer loads `.env` implicitly, so it is loaded here using
 * Node's built-in `process.loadEnvFile` (Node >= 20.12) rather than adding a
 * `dotenv` dependency.
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * Deliberately `process.env` rather than Prisma's `env()` helper: `env()`
 * throws when the variable is absent, which would make every CLI invocation
 * fail without a database — including `prisma generate` and
 * `prisma migrate diff`, neither of which connects to one. Those two commands
 * are what allow the schema and its initial migration to be developed with no
 * Postgres server running.
 *
 * An empty string is left to fail loudly at connection time for the commands
 * that genuinely need a database (`migrate deploy`, `db seed`).
 */
const databaseUrl = process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
});

import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * Ephemeral local PostgreSQL server for development and verification.
 *
 * PGlite is a genuine PostgreSQL build compiled to WebAssembly, and
 * `pglite-socket` exposes it over TCP speaking the real wire protocol. That
 * means `@prisma/adapter-pg` connects to it exactly as it connects to Neon:
 * migrations, extensions, full-text search, and trigram indexes all execute as
 * real Postgres rather than an emulation.
 *
 * This exists so that a fresh clone needs no Docker daemon and no installed
 * Postgres to run the application end to end. Production always uses a real
 * server; this is a development convenience only, which is why the package is
 * a devDependency and the data directory is gitignored.
 *
 *   npm run db:dev          # start on 5432, persisting to .pglite/
 *
 * pg_trgm is loaded explicitly because the initial migration creates a trigram
 * index; PGlite ships contrib extensions as separate modules that must be
 * registered at construction time rather than found on disk.
 */
const PORT = Number(process.env.DEV_DB_PORT ?? 5432);
const DATA_DIR = ".pglite";

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  const pglite = await PGlite.create({
    dataDir: DATA_DIR,
    extensions: { pg_trgm },
  });

  const server = new PGLiteSocketServer({ db: pglite, port: PORT, host: "127.0.0.1" });
  await server.start();

  console.log(`PGlite listening on 127.0.0.1:${PORT} (data in ${DATA_DIR}/)`);
  console.log(
    `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable"`,
  );

  const shutdown = async (): Promise<void> => {
    await server.stop();
    await pglite.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

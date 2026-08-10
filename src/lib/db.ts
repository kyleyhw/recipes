import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
import { env } from "@/lib/env";

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter rather than reading a URL from the
 * schema. `@prisma/adapter-pg` speaks the standard PostgreSQL wire protocol,
 * so the same adapter serves local development and Neon in production — Neon's
 * pooled connection string is an ordinary Postgres endpoint. Using one adapter
 * for both avoids a class of bug where local and deployed behaviour diverge.
 *
 * The global cache exists because Next.js recreates modules on every hot
 * reload in development; without it each edit opens a new connection pool and
 * the database's connection limit is reached within a few minutes.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    /**
     * Pool ceiling. Five is comfortable for a serverless function against
     * Neon's pooler, where each instance is short-lived and concurrency is
     * bounded by the platform rather than by this number.
     *
     * It must be lowered to 1 when running against the PGlite development
     * server (`npm run db:dev`), which serves a single connection at a time and
     * terminates the surplus -- surfacing as "Connection terminated
     * unexpectedly" on an otherwise correct query. See docs/self-hosting.md.
     */
    max: env.DB_POOL_MAX,
    /**
     * Reap idle connections quickly. A serverless instance is frozen between
     * invocations, and a connection held open across a freeze is dead on
     * resume; returning it to the pool sooner makes that window smaller.
     */
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

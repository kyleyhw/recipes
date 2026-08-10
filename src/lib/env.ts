import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Parsed once at module load so that a misconfigured deployment fails at
 * startup with a precise message, rather than at the first request with an
 * opaque one. Importing `server-only` guarantees a build error if this module
 * is ever pulled into a client bundle, which would leak the API keys.
 *
 * Optionality is deliberate and load-bearing (see docs/self-hosting.md):
 * a clone with `DATABASE_URL` and the two session variables alone is a fully
 * working recipe box. Each absent optional key degrades one feature rather
 * than breaking the application.
 */
const envSchema = z.object({
  // --- required ---
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    // iron-session refuses secrets shorter than 32 characters; failing here
    // with an explicit message beats failing inside the cookie library.
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  OWNER_PASSWORD_HASH: z
    .string()
    .min(1, "OWNER_PASSWORD_HASH is required — generate one with `npm run setup`"),

  // --- optional: each absence disables exactly one capability ---
  /** Absent: all Claude features hide themselves. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Absent: macro lookup falls back to manual entry. */
  USDA_API_KEY: z.string().optional(),
  /** Absent: photos fall back to the deterministic placeholder. */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  /**
   * Monthly ceiling on model spend, in USD. Checked against recorded
   * AiInteraction costs before any billable call. Default chosen as a figure
   * that comfortably covers personal use while bounding the damage from a
   * runaway loop; it is not a meaningful limit in itself, only a backstop.
   */
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(10),

  /**
   * Public origin of this deployment, e.g. https://recipes.example.com.
   * Used to build share links and to stamp provenance on exported bundles so
   * an importing instance can attribute the source. Vercel provides
   * VERCEL_PROJECT_PRODUCTION_URL automatically; this overrides it.
   */
  APP_URL: z.string().url().optional(),

  /**
   * Maximum PostgreSQL connections in the pool. Defaults to 5, which suits a
   * serverless deployment against a pooled endpoint. Set to 1 when running
   * against the PGlite development server, which accepts one connection at a
   * time.
   */
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `See .env.example and docs/self-hosting.md.`,
    );
  }
  return parsed.data;
}

export const env: Env = loadEnv();

/** Feature availability, derived from which optional keys are present. */
export const features = {
  ai: Boolean(env.ANTHROPIC_API_KEY),
  usda: Boolean(env.USDA_API_KEY),
  blobStorage: Boolean(env.BLOB_READ_WRITE_TOKEN),
} as const;

/**
 * Public origin, preferring the explicit setting and falling back to the URL
 * Vercel injects. Returns null when neither is available (local `next dev`),
 * in which case callers render relative links instead of absolute ones.
 */
export function appUrl(): string | null {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

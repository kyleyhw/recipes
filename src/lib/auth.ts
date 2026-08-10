import "server-only";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { env } from "@/lib/env";

/**
 * Typed promise wrapper around `crypto.scrypt`.
 *
 * `promisify` cannot be used here: `scrypt` is overloaded, and promisify
 * resolves to the three-argument form, which rejects the cost-parameter object
 * this module must pass. Wrapping by hand keeps the options fully typed.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * Authentication for a single-owner deployment.
 *
 * There is no user table, no registration, and no password reset: one password
 * hash lives in the environment, and a successful check mints a sealed cookie.
 * This is the entire authorisation surface, which is what makes the app safe to
 * expose publicly without building account management.
 */

// --- Password hashing -------------------------------------------------------

/**
 * scrypt cost parameters (RFC 7914 notation).
 *
 * N = 2^15 is the interactive-login figure recommended by the scrypt paper and
 * carried into OWASP's guidance; on this class of hardware it costs order 100 ms,
 * which is imperceptible on a login page and expensive in bulk.
 * r = 8 and p = 1 are the standard values those recommendations assume.
 *
 * maxmem must be raised explicitly: scrypt's working set is 128 * N * r bytes
 * = 128 * 32768 * 8 = 33.5 MB, which exceeds Node's 32 MB default and would
 * otherwise throw ERR_CRYPTO_INVALID_SCRYPT_PARAMS. 64 MiB gives headroom.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
/** 64 bytes: scrypt's natural block size, and well beyond birthday-bound concerns. */
const KEY_LENGTH = 64;
/** 16 bytes of salt — the conventional minimum, ample against precomputation. */
const SALT_LENGTH = 16;

/** Field separator for the stored hash. See HASH_SEPARATOR_NOTE below. */
const HASH_SEP = ":";

/**
 * Produces a self-describing hash string of the form
 * `scrypt:N:r:p:<salt-base64>:<key-base64>`.
 *
 * The parameters are embedded rather than assumed so that raising the cost
 * later does not invalidate existing hashes: verification reads N, r and p
 * from the stored string.
 *
 * HASH_SEPARATOR_NOTE — why ':' and not the conventional '$':
 * The canonical PHC/modular-crypt format uses '$' as its separator, but this
 * value is transported through a `.env` file, and Next.js runs dotenv-expand
 * over those files. dotenv-expand interprets `$32768` and `$8` as variable
 * references and substitutes them with empty strings, silently truncating the
 * hash and making every login fail with "incorrect password" and no
 * indication why. Quoting does not reliably prevent it. Choosing a separator
 * outside the expansion grammar removes the failure mode entirely rather than
 * documenting a workaround. Base64 emits only A-Za-z0-9+/=, so ':' is
 * unambiguous as a delimiter.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join(HASH_SEP);
}

/**
 * Constant-time verification against a stored hash.
 *
 * Returns false rather than throwing on a malformed stored hash, so a
 * misconfigured `OWNER_PASSWORD_HASH` denies access instead of leaking a stack
 * trace that distinguishes "bad configuration" from "wrong password".
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(HASH_SEP);
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltB64 = parts[4];
  const keyB64 = parts[5];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (saltB64 === undefined || keyB64 === undefined) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    return false;
  }

  // timingSafeEqual throws on length mismatch, which would itself be a timing
  // signal; the lengths are equal by construction above, but guard anyway.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// --- Session ----------------------------------------------------------------

export interface SessionData {
  /** Present only once authenticated; absence is the unauthenticated state. */
  authenticatedAt?: number;
}

/** Cookie name is shared with src/proxy.ts, which verifies the same seal. */
export const SESSION_COOKIE = "recipes_session";

/**
 * 30 days. Long enough that a phone in a kitchen is not repeatedly logged out,
 * short enough that an abandoned session does not persist indefinitely.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function sessionOptions() {
  return {
    password: env.SESSION_SECRET,
    cookieName: SESSION_COOKIE,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // Secure cookies would never be sent over plain HTTP, which would make
      // local development impossible; production is always HTTPS.
      secure: env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const store = await cookies();
  // Boundary narrowing, permitted by the third-party-boundary rule of §1.2.
  //
  // Next's ReadonlyRequestCookies and iron-session's (unexported) CookieStore
  // describe the same runtime object, but their `set` overloads disagree on
  // whether the optional third parameter is declared `| undefined`. Under
  // `exactOptionalPropertyTypes` those are distinct types, so a sound
  // assignment is rejected. `as never` is used rather than a restatement of
  // CookieStore because the interface is not exported and any local copy would
  // drift silently if the library changed it; `never` is assignable to every
  // parameter type, and unlike `any` it cannot leak an unchecked type outward.
  //
  // The alternative -- disabling exactOptionalPropertyTypes project-wide --
  // would trade a real check across every file for this single cast.
  return getIronSession<SessionData>(store as never, sessionOptions());
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return typeof session.authenticatedAt === "number";
}

export async function signIn(): Promise<void> {
  const session = await getSession();
  session.authenticatedAt = Date.now();
  await session.save();
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

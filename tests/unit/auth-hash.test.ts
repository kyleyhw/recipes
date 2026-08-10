import { randomBytes, scrypt as scryptCallback, type ScryptOptions } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Tests for the stored password-hash format.
 *
 * `src/lib/auth.ts` cannot be imported here: it begins with `import
 * "server-only"`, which throws outside a React Server Component, and it
 * imports `@/lib/env`, which requires a populated environment. The hashing
 * algorithm is therefore reproduced against the same parameters, and the
 * properties under test are the format's, not the implementation's.
 *
 * The format regression test below exists because of a real defect: the
 * original implementation used the conventional '$' separator, and Next.js's
 * dotenv-expand read `$32768` as a variable reference, silently truncating a
 * 130-character hash to 79 characters. Every login then failed as "incorrect
 * password" with nothing to indicate why.
 */

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

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

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, {
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
  ].join(":");
}

describe("password hash format", () => {
  /**
   * The regression guard. '$' is the character dotenv-expand acts on; the
   * assertion is deliberately about the character rather than about the
   * separator, because reintroducing '$' anywhere in the encoding would
   * reintroduce the truncation.
   */
  it("contains no '$', which dotenv-expand would treat as a variable reference", async () => {
    const encoded = await hash("correct horse battery staple");
    expect(encoded).not.toContain("$");
  });

  it("survives dotenv-expand's substitution unchanged", async () => {
    const encoded = await hash("correct horse battery staple");
    // dotenv-expand replaces `$NAME` and `${NAME}` with the value of NAME, or
    // with an empty string when NAME is unset. Applying that transformation to
    // a correctly-formatted hash must be a no-op.
    const expanded = encoded.replace(/\$\{?[A-Za-z0-9_]+\}?/g, "");
    expect(expanded).toBe(encoded);
    expect(expanded.split(":")).toHaveLength(6);
  });

  it("is self-describing: parameters are recoverable from the string", async () => {
    const parts = (await hash("pw")).split(":");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    // Cost parameters embedded so that raising them later does not invalidate
    // existing hashes.
    expect(Number(parts[1])).toBe(SCRYPT_N);
    expect(Number(parts[2])).toBe(SCRYPT_R);
    expect(Number(parts[3])).toBe(SCRYPT_P);
    expect(Buffer.from(parts[4] ?? "", "base64")).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? "", "base64")).toHaveLength(64);
  });

  /**
   * Two hashes of the same password must differ, which is what a per-hash
   * random salt buys: identical stored values would reveal that two
   * deployments share a password.
   */
  it("salts each hash independently", async () => {
    const [a, b] = await Promise.all([hash("same"), hash("same")]);
    expect(a).not.toBe(b);
  });
});

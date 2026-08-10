import { randomBytes, scrypt as scryptCallback, type ScryptOptions } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/** See the note in src/lib/auth.ts: promisify picks scrypt's 3-argument overload. */
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
 * First-run setup helper.
 *
 * Prints the two secrets a fresh deployment needs, so a self-hoster never has
 * to hand-craft a scrypt hash or invent entropy. Nothing is written to disk:
 * the values are printed for pasting into a `.env` file or a Vercel project's
 * environment settings, which keeps secrets out of the working tree.
 *
 * The scrypt parameters here MUST match src/lib/auth.ts; they are duplicated
 * because this script runs standalone via tsx and importing the app's module
 * would pull in `server-only` and the environment validation, neither of which
 * can load before the environment exists.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

async function hashPassword(password: string): Promise<string> {
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
  ].join(":");
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const password = (await rl.question("Choose an owner password: ")).trim();
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const hash = await hashPassword(password);
    // 32 bytes -> 64 hex characters, comfortably above iron-session's 32-character
    // minimum and a full 256 bits of entropy.
    const sessionSecret = randomBytes(32).toString("hex");

    console.log("\nAdd these to .env (local) or your deployment's environment:\n");
    console.log(`SESSION_SECRET=${sessionSecret}`);
    console.log(`OWNER_PASSWORD_HASH=${hash}`);
    console.log(
      "\nPaste both lines verbatim. The hash is ':'-separated rather than the " +
        "conventional '$'-separated form specifically so that dotenv variable " +
        "expansion cannot corrupt it.\n",
    );
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

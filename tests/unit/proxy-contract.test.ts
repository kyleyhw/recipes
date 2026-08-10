import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Pins the two constants that `src/proxy.ts` deliberately duplicates.
 *
 * The proxy runs in the edge runtime and cannot import `@/lib/auth`, which
 * pulls in `server-only` and `node:crypto`. It therefore restates the session
 * cookie name. If the two ever diverge, every request would be redirected to
 * the login page while the application believed the user was signed in — a
 * confusing failure that no other test would catch, because each module is
 * individually correct.
 *
 * The files are read as text rather than imported: importing `@/lib/auth`
 * requires a populated environment and a server context.
 */

const proxySource = readFileSync(new URL("../../src/proxy.ts", import.meta.url), "utf8");
const authSource = readFileSync(
  new URL("../../src/lib/auth.ts", import.meta.url),
  "utf8",
);

function extractStringConst(source: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(source);
  return match?.[1];
}

describe("proxy / auth shared contract", () => {
  it("uses the same session cookie name in both modules", () => {
    const inProxy = extractStringConst(proxySource, "SESSION_COOKIE");
    const inAuth = extractStringConst(authSource, "SESSION_COOKIE");
    expect(inProxy).toBeDefined();
    expect(inAuth).toBeDefined();
    expect(inProxy).toBe(inAuth);
  });

  /**
   * The public surface is a security boundary: anything listed here is
   * reachable without a session. The test states the intended set explicitly so
   * that widening it is a deliberate edit to this file rather than an
   * unremarked change to a constant.
   */
  it("exposes exactly the three intended public prefixes", () => {
    const match = /PUBLIC_PREFIXES\s*=\s*\[([^\]]+)\]/.exec(proxySource);
    expect(match).not.toBeNull();
    const prefixes = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(prefixes).toEqual(["/login", "/r/", "/api/public/"]);
  });

  it("returns 401 for API routes rather than redirecting them", () => {
    // A redirect to an HTML login page is useless to a fetch() caller and
    // makes a 401 look like a 200 with the wrong body.
    expect(proxySource).toContain('pathname.startsWith("/api/")');
    expect(proxySource).toContain("status: 401");
  });
});

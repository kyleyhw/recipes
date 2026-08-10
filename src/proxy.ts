import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";

/**
 * Session gate.
 *
 * Everything is private except the login page, the public share pages, and the
 * public bundle API — the three surfaces that must work for a logged-out
 * visitor holding a share link.
 *
 * This module deliberately reads `process.env` directly rather than importing
 * `@/lib/env`, and re-derives the cookie name rather than importing
 * `@/lib/auth`: the proxy runs in the edge runtime, and both of those modules
 * import `server-only` and Node built-ins (`node:crypto`) that are unavailable
 * there. The duplication is two string constants, pinned by the test in
 * tests/unit/proxy-contract.test.ts.
 */

const SESSION_COOKIE = "recipes_session";

/** Path prefixes reachable without a session. */
const PUBLIC_PREFIXES = ["/login", "/r/", "/api/public/"] as const;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

interface SessionShape {
  authenticatedAt?: number;
}

/**
 * Full cryptographic verification, not merely a presence check.
 *
 * A presence check would let a forged cookie through the gate and rely on every
 * downstream page re-checking; verifying the seal here means the gate is
 * authoritative and a missed check in a page is not a vulnerability.
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return false;

  const password = process.env.SESSION_SECRET;
  if (!password) return false;

  try {
    const data = await unsealData<SessionShape>(cookie.value, { password });
    return typeof data.authenticatedAt === "number";
  } catch {
    // Tampered, expired, or sealed under a rotated secret.
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();

  // API routes get a status code; pages get a redirect carrying the intended
  // destination, so signing in lands where the user was actually going.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Exclude Next's own asset routes and static files from the gate. Matching
   * them would gate the CSS and JS of the login page itself.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};

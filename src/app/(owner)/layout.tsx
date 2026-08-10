import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated, signOut } from "@/lib/auth";
import { features } from "@/lib/env";

/**
 * Layout for every owner-only route.
 *
 * src/proxy.ts already verifies the session seal, so this check is defence in
 * depth rather than the primary gate: it means a future change to the proxy's
 * matcher cannot silently expose these pages.
 */
export default async function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAuthenticated())) redirect("/login");

  async function endSession(): Promise<void> {
    "use server";
    await signOut();
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      {/* nowrap + horizontal scroll: at phone width the link set is wider than
          the viewport, and wrapping pushed "Sign out" onto its own line. */}
      <header className="flex items-center gap-4 overflow-x-auto border-b border-border py-4 whitespace-nowrap">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Recipes
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm text-text-muted">
          <Link href="/recipes/new" className="hover:text-text">
            New
          </Link>
          <Link href="/import" className="hover:text-text">
            Import
          </Link>
          {features.ai ? (
            <Link href="/generate" className="hover:text-text">
              Generate
            </Link>
          ) : null}
          <Link href="/ingredients" className="hover:text-text">
            Ingredients
          </Link>
          <Link href="/memories" className="hover:text-text">
            Memories
          </Link>
        </nav>
        <form action={endSession}>
          <button
            type="submit"
            className="text-sm text-text-muted hover:text-text"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex-1 py-6">{children}</main>

      <footer className="border-t border-border py-4 text-xs text-text-muted">
        Macros are computed for export, not tracked here.
      </footer>
    </div>
  );
}

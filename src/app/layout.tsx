import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { repoUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Recipes",
  description: "A personal recipe collection: scaling, macros, and one file per recipe.",
};

export const viewport: Viewport = {
  // Used one-handed at a kitchen counter; mobile-first, and never zoom-locked.
  width: "device-width",
  initialScale: 1,
};

/**
 * The shell.
 *
 * There is no sign-out because there is no session: the site is static and
 * public. The header is three links and the repository, which is where a recipe
 * is actually edited.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const repo = repoUrl();

  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-text antialiased">
        <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
          {/* nowrap + scroll: at phone width the link set is wider than the
              viewport, and wrapping pushed the last link onto its own line. */}
          <header className="flex items-center gap-4 overflow-x-auto border-b border-border py-4 whitespace-nowrap">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Recipes
            </Link>
            <nav className="flex flex-1 items-center gap-4 text-sm text-text-muted">
              <Link href="/ingredients" className="hover:text-text">
                Ingredients
              </Link>
              <Link href="/about" className="hover:text-text">
                About
              </Link>
            </nav>
            {repo ? (
              <a
                href={repo}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-text-muted hover:text-text"
              >
                Source
              </a>
            ) : null}
          </header>

          <main className="flex-1 py-6">{children}</main>

          <footer className="border-t border-border py-4 text-xs text-text-muted">
            Macros are computed for export, not tracked here. One file per recipe.
          </footer>
        </div>
      </body>
    </html>
  );
}

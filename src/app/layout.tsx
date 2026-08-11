import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { repoUrl } from "@/lib/site";
import { ThemeToggle, themeScript } from "@/components/theme-toggle";

/**
 * Source Serif 4, self-hosted.
 *
 * A system font stack does not look the same on two devices — it looks like
 * whichever of its entries happens to be installed, and on a machine with none
 * of them it falls back to a generic serif that renders badly. A recipe read
 * from a phone propped against a jar should look the way it was designed to.
 *
 * Source Serif was drawn for screens at text sizes: open counters, sturdy
 * stems, a large x-height. That is what keeps it legible at arm's length across
 * a kitchen, which is the only viewing condition this application has.
 */
const sourceSerif = localFont({
  src: [
    { path: "./fonts/source-serif-4-normal.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/source-serif-4-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-source-serif",
  // Show the fallback immediately rather than holding the page blank: a recipe
  // you can read in the wrong font beats one you cannot read yet.
  display: "swap",
});

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
    <html lang="en" className={sourceSerif.variable}>
      <head>
        {/* Applies a remembered light choice before first paint, so nobody who
            chose light sees a dark flash on every navigation. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
          {/* nowrap + scroll: at phone width the link set is wider than the
              viewport, and wrapping pushed the last link onto its own line. */}
          <header className="flex items-center gap-4 overflow-x-auto border-b border-border py-4 whitespace-nowrap">
            {/* Separated by rules rather than by space alone. Three words in a
                row read as a heading; three words divided read as a set of
                choices, which is what they are. */}
            <nav className="flex flex-1 items-center gap-3 text-sm">
              <Link href="/" className="font-semibold hover:text-accent">
                Recipes
              </Link>
              <span aria-hidden="true" className="text-border">
                |
              </span>
              <Link href="/ingredients" className="text-text-muted hover:text-accent">
                Ingredients
              </Link>
              <span aria-hidden="true" className="text-border">
                |
              </span>
              <Link href="/about" className="text-text-muted hover:text-accent">
                About
              </Link>
            </nav>
            <div className="flex items-center gap-4">
              <ThemeToggle />
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
            </div>
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

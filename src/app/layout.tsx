import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { repoUrl } from "@/lib/site";
import { ThemeToggle, themeScript } from "@/components/theme-toggle";
import { IngredientSidebar } from "@/components/ingredient-sidebar";
import { loadCollection } from "@/lib/content/library";

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
 * A divider between two links.
 *
 * Decoration, so it is hidden from assistive technology: a screen reader
 * announcing "vertical line" between every navigation item would turn a row of
 * five links into a row of nine things. The rules are bookends as well as
 * separators — one before the first link and one after the last — so the set
 * reads as closed rather than as trailing off into the rest of the header.
 */
function Pipe() {
  return (
    <span aria-hidden="true" className="text-border">
      |
    </span>
  );
}

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
  const { recipes, categories: allCategories, ingredients } = loadCollection();

  // Only categories with something in them: an empty shelf is not a place to
  // go, and offering one is a promise the collection does not keep.
  const used = new Set(recipes.map((recipe) => recipe.category));
  const categories = allCategories.filter((category) => used.has(category.name));

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
            {/* The navigation is the collection's own shape: the categories
                that actually hold recipes, in the order the collection defines.
                An empty category is not a place to go, so it is not offered.

                Separated by rules rather than by space alone — words in a row
                read as a heading, words divided read as a set of choices. */}
            <nav className="flex flex-1 items-center gap-3 text-sm">
              <Pipe />
              <Link href="/" className="font-semibold hover:text-accent">
                All
              </Link>
              {categories.map((category) => (
                <span key={category.slug} className="flex items-center gap-3">
                  <Pipe />
                  <Link
                    href={`/category/${category.slug}`}
                    className="text-text-muted hover:text-accent"
                  >
                    {category.name}
                  </Link>
                </span>
              ))}
            </nav>
            {/* Divided from the categories by a rule and a wider gap, not by
                space alone: these two are not another two shelves to browse,
                and at a glance they were reading as though they were. */}
            <div className="ml-2 flex items-center gap-3 border-l border-border pl-4 text-sm">
              <IngredientSidebar ingredients={ingredients} />
              <Pipe />
              <Link href="/about" className="text-text-muted hover:text-accent">
                About
              </Link>
              <Pipe />
            </div>
          </header>

          <main className="flex-1 py-6">{children}</main>

          {/* The theme and the repository live at the bottom. Neither is part
              of browsing: one is set once and never touched again, and the
              other is where you go when you have stopped reading recipes and
              started reading the thing that holds them. */}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4 text-xs text-text-muted">
            <span>
              Macros are computed for export, not tracked here. One file per recipe.
            </span>
            <div className="flex items-center gap-3">
              {repo ? (
                <>
                  <a
                    href={repo}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-text"
                  >
                    Source
                  </a>
                  <span aria-hidden="true" className="text-border">
                    |
                  </span>
                </>
              ) : null}
              <ThemeToggle />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

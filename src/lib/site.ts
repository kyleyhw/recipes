/**
 * Where this copy of the site lives.
 *
 * A static site cannot look these up at request time, so they are baked in at
 * build time from the environment the Pages workflow provides. Every value is
 * optional and every consumer degrades to hiding a link rather than rendering a
 * broken one: a clone built on someone's laptop with no environment set is a
 * working recipe book that simply does not offer "edit this on GitHub".
 */

/**
 * The repository's web address, e.g. `https://github.com/user/recipes`.
 *
 * Set by the workflow from `GITHUB_REPOSITORY`. It is what makes "edit this
 * file" and "see its history" possible on a site with no server: the links go
 * to GitHub, which has both.
 */
export function repoUrl(): string | null {
  const slug = process.env["NEXT_PUBLIC_REPO"];
  if (!slug) return null;
  return `https://github.com/${slug}`;
}

/** The `owner/repo` slug, for the GitHub API. Null when unset. */
export function repoSlug(): string | null {
  return process.env["NEXT_PUBLIC_REPO"] ?? null;
}

/**
 * A path to something in `public/`, as the browser must ask for it.
 *
 * A project page is served from a subdirectory, so `/photos/x.webp` is really
 * `/recipes/photos/x.webp`. Next rewrites the URLs it generates itself, but an
 * `<img src>` written by this application is a string it never sees — so the
 * prefix is applied here, once, on the way out of the content layer. Baked at
 * build time, like everything else on a site with no server.
 */
export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env["PAGES_BASE_PATH"] ?? "";
  return base && path.startsWith("/") ? `${base}${path}` : path;
}

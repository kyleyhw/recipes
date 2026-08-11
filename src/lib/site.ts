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

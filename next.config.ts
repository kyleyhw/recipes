import type { NextConfig } from "next";

/**
 * Two build targets, one codebase.
 *
 * `STATIC_EXPORT=1` produces the GitHub Pages build: `next build` writes an
 * `out/` directory of plain HTML, CSS and JavaScript that any static host can
 * serve. Without it, the ordinary server build is produced.
 *
 * The two are not interchangeable. A static export cannot use Server Actions,
 * cookies, the proxy, redirects, or request-time Route Handlers — verified
 * against `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`,
 * which lists all of them as unsupported. Every mutation therefore has to move
 * into the browser, and authentication with it. See docs/github-pages.md.
 *
 * `basePath` exists because a GitHub project page is served from a
 * subdirectory: `https://<user>.github.io/<repo>`. Every internal link and
 * asset URL must carry that prefix or the site 404s on its own CSS. It is read
 * from the environment so that a user page or a custom domain — both served
 * from the root — can build the same code with the variable unset.
 */

const staticExport = process.env["STATIC_EXPORT"] === "1";

// Set by the Pages workflow to the repository name. Empty for a user page or a
// custom domain, where the site is served from the root.
const basePath = process.env["PAGES_BASE_PATH"] ?? "";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export",
        // GitHub Pages serves `/x/` from `/x/index.html`; without trailing
        // slashes the exported `/x.html` is unreachable at the link's own URL.
        trailingSlash: true,
        images: {
          // There is no server to optimise images, so they are served as-is.
          unoptimized: true,
        },
        ...(basePath ? { basePath, assetPrefix: basePath } : {}),
      }
    : {}),
};

export default nextConfig;

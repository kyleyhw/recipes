# Hosting on GitHub Pages

GitHub Pages serves static files. There is no server, no database, no
request-time code, and no place to keep a secret. That is not a limitation to
work around — it decides the architecture, and this document records what
changes and why.

Verified against `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`
for the Next version in this repository. The following are **unsupported** in a
static export, and the application used all of them:

| Feature | Used for | Replacement |
| --- | --- | --- |
| Server Actions | every mutation | GitHub API calls from the browser |
| `cookies()` | the session | a token in browser storage |
| Proxy (middleware) | the auth gate | nothing — the site is public |
| `redirect()` | post-action navigation | client-side navigation |
| Route Handlers with `Request` | exports, the public bundle API | files generated at build time |

---

## 1. The shape of the static site

```
content/recipes/*.md   ── next build ──▶   out/   ── Actions ──▶  GitHub Pages
       (source of truth)                (static site)
```

Every page is generated once, at build time, from the files in `content/`.
A recipe page is an HTML file. Browsing, reading, scaling, the macro panel and
the exports are all static — they work with JavaScript disabled and they cost
nothing to serve.

The repository is the database. A recipe is `content/recipes/<slug>.md`, its
history is that file's git history, and sharing it is sending the file or its
URL. This is the arrangement described in
[log-and-history.md](log-and-history.md) and
[sharing-format.md](sharing-format.md), with git doing the work those documents
previously described building by hand.

---

## 2. Authentication

**The site is publicly readable, and cannot be otherwise.** A GitHub Pages site
is public even when its repository is private, except on GitHub Enterprise
Cloud. There is no server to check a password against, and a password checked in
the browser is not a password — the check and the data are both in front of
whoever wants them.

So authentication protects **writing**, not reading. Recipes are readable by
anyone with the URL; changing them requires proving to *GitHub* that you are
you.

### What signing in means

You paste a **fine-grained personal access token** with `Contents: read and
write` on this repository and nothing else. The browser sends it directly to
`api.github.com` when you save a recipe. It is never sent anywhere else — there
is nowhere else to send it, because there is no server.

### Keep me signed in

The sign-in form offers a choice, and it is a real one:

| | Where the token is kept | Survives |
| --- | --- | --- |
| **Keep me signed in** (default) | `localStorage` | closing the tab, restarting the browser, restarting the phone |
| Just this once | `sessionStorage` | until the tab closes |

`localStorage` on your own device is the right default for a personal recipe
collection you edit standing in a kitchen: being asked to paste a token every
time you fix a quantity would mean nobody ever fixes a quantity.

It is stated plainly rather than buried, because the trade is real: a token in
`localStorage` is readable by any script that runs on the page, so the site
ships no third-party scripts and no analytics, and there is nowhere for a
cross-site request to send it. **Sign out** deletes it from both stores.

Scope the token narrowly and give it an expiry — GitHub will email you when it
is close. A token limited to `Contents` on one repository can, at worst, change
your recipes, which are also in your git history.

---

## 3. Deploying

1. **Push to `main`.** The workflow in `.github/workflows/pages.yml` builds and
   deploys on every push.
2. **Settings → Pages → Source: GitHub Actions.** Once.
3. The site appears at `https://<user>.github.io/<repo>/`.

The workflow sets `PAGES_BASE_PATH` to the repository name, because a project
page is served from a subdirectory and every asset URL needs that prefix. For a
user page (`<user>.github.io`) or a custom domain, both served from the root,
leave it unset.

Nothing else is configured, and there is nothing to pay for.

---

## 4. What Claude costs you here

There is no server to hold an API key, so the AI features work only if **you**
supply a key in your own browser, kept the same way the GitHub token is. They
are off until you do.

This is a genuine downgrade in safety over a server-side key, and it is why they
are off by default rather than merely unconfigured. Everything else — writing
recipes, importing them, scaling, macros, notes, history — works with no keys at
all. It is a recipe book first.

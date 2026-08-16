# Test report — Attribution from git

**Date:** 2026-08-16
**Scope:** who added each recipe, derived from `git log` at build time; the line
that renders it; the `author` field in the JSON and JSON-LD exports; the
workflow changes that make a contributed recipe checkable before it merges.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Full unit suite (402 tests, 18 files) | ~2.1 s |
| `attribution.test.ts` (16 tests) | 18 ms |
| Static build, 16 recipes | 12 s |
| Rendered check, three languages | ~6 s |

---

## 1. What is being defended against

Attribution is derived rather than declared: there is no `addedBy:` field, and
the name on a recipe page comes from the commit that added the file. That
removes the ordinary failure — a field nobody fills in — and replaces it with a
worse-behaved one. A wrong name is **plausible, confident, and invisible to the
person it is wrong about**, because the person who would notice is the one not
being credited, and they have no reason to be reading someone else's recipe
page.

So the tests are shaped around the four ways `git log` can be misread rather
than around the happy path, which is one line.

| Test | What it defends |
| --- | --- |
| The adding commit is the credit | The base case, and the only one that is obvious |
| A later editor does not displace the author | The commonest history: someone fixes a quantity a month later |
| The author is not listed among the editors of their own recipe | Cosmetic, but "Added by Ada. Edited since by Ada." reads as a bug |
| **A rename does not transfer authorship** | `--find-renames`, and the reason it is in the log arguments. A recipe given a better slug is the same recipe; without this the credit silently moves to whoever tidied the filename |
| **A translation is an edit, never an origin** | `banana-bread.ru.md` is work on `banana-bread`. Attributing the dish to its translator is wrong in both directions |
| A file whose adding commit is absent gets no attribution | The shallow-clone and truncated-history case, at the parser level: saying nothing beats crediting the last editor |
| **No email address survives the parse** | Privacy, asserted on the serialised output rather than field by field, so a field added later cannot leak one past the test |
| Commits touching nothing under `content/recipes/` are ignored | `updatedOn` must mean "this recipe changed", not "the repository did" |
| The repository owner is linked; everyone else is left alone | `adoptOwner` is the one place a handle is inferred from something other than an address. It is an exact match against a login the build was given, and the test pins that it does not spread |

The two addresses in the fixtures — `1024+ada@users.noreply.github.com` and the
older bare `ada@users.noreply.github.com` — are both of GitHub's private-address
forms, because a test of only the current form would pass while every commit
made before 2017 rendered unlinked. The negative case
(`bob@users.noreply.github.com.example.com`) is a domain that *contains* the
real one, which is the input a naive `includes()` check gets wrong.

## 2. Run against the real repository

The parser was run against this repository's own history: 18 attributions from
16 recipes — the two extras are slugs that existed and were removed, which cost
nothing and are never looked up. Every current recipe resolved to a name, a
date, and the commit hash that added it, and each hash was checked to be a
commit that does add that file.

The built site was then read back out of `out/`:

- `out/recipes/banana-bread/index.html` carries the sentence with both links —
  the name to a profile, the date to `…/commit/4af85bb…`.
- `export/jsonld` carries `author: {"@type": "Person", name, url}`, which is the
  property schema.org defines for it, so an importer that reads the document
  gets the credit with it.
- `export/json` carries the same as `addedBy`.

## 3. Rendered, in three languages

Screenshotted at 820 px in English, 繁體中文 and Русский. The sentence is built
from the string table with the person and the date substituted as elements, so
the word order is the table's rather than English's — the Chinese renders
「由 kyleyhw 於 2026-08-11 加入。」 with the person first, and the Russian
"Добавил(а) kyleyhw, 2026-08-11." with the verb first. Both were confirmed by
eye rather than by assertion; a string that renders in the wrong order still
passes a test for its parts.

This also caught a pre-existing gap, unrelated to attribution: the ", or see"
between the file links was hard-coded English, and read as English inside both
Chinese and Russian pages. It now comes from the table.

## 4. Not covered

**The shallow-clone guard is not exercised by a test.** `loadAttribution` asks
git whether the repository is shallow and returns nothing if it is, which needs
a real shallow clone to exercise and is therefore verified by reading rather
than by running. The parser-level half of the same failure — an adding commit
that is not in the log — *is* tested, and is what actually protects the output:
even with the guard removed, a truncated history produces no attribution rather
than a wrong one, for every recipe except any that happens to be added within
the fetched depth.

**What GitHub does at merge time.** Squash-merging a pull request sets the
commit's *author* to the contributor and the *committer* to whoever merged, and
this module reads `%an`, the author. That is documented behaviour and it is what
makes the feature work for contributors, but it has not been observed here —
this repository has had no pull request yet. The first one is worth watching.

**Two people, one name.** Identity is a handle where one is known and the
display name otherwise, so two contributors with no GitHub address and the same
display name would merge into one person. The alternative — treating every
distinct address as a distinct person — splits one contributor across their
laptop and their phone, which is the commoner situation and the more visible
error.

**Co-authored commits.** `Co-authored-by:` trailers are not read. A recipe
written by two people together is credited to the commit's author, and the
other name is in the trailer, in the history, unread by the site.

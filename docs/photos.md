# Photographs

Every recipe can carry a picture. There are two ways to get one, and they are
not equal:

- **`npm run photo:add`** puts a photograph *you took* on a recipe. No key, no
  network, no cost. This is the good one.
- **`npm run photos`** draws one with an image model. It needs a key and costs
  money, and what it produces is decoration rather than evidence.

Both write `public/photos/<slug>.webp` at 1200×675 and set `photo:` in the
recipe's front matter, so they are interchangeable and a real photograph can
replace a generated one at any time.

---

## Why generated pictures are labelled

An image model has never cooked anything. What comes back matches the words of
the recipe, not the dish, and nobody made it from these instructions — so it
cannot be evidence of anything.

This collection is careful about that sort of thing elsewhere: attribution comes
from git so nobody can fill it in wrong, a nutrition coverage gap is shown
rather than rounded away, and a diagram that disagrees with its method is
treated as the diagram lying. An unlabelled synthetic photograph would be the
one place it quietly stopped.

So every generated image is credited on the page as generated, naming the model,
in the place a photographer would have been credited. That line is not optional.

---

## Money

**As of August 2026 the whole collection costs about $3.15 batched on the
default model, and as little as $0.79 batched on Nano Banana 2 Lite.**

| Model | Per image | Batched | 47 recipes (list / batch) | Notes |
| --- | --- | --- | --- | --- |
| `gemini-3-pro-image` | ~$0.134 | ~$0.067 | $6.30 / $3.15 | Nano Banana Pro. The default. |
| `gemini-3.1-flash-image` | ~$0.067 | ~$0.034 | $3.15 / $1.60 | Nano Banana 2. |
| `gemini-3.1-flash-lite-image` | ~$0.0336 | ~$0.0168 | $1.58 / $0.79 | Nano Banana 2 Lite. The cheapest. |
| `gemini-2.5-flash-image` | ~$0.039 | ~$0.020 | $1.83 / $0.92 | The original. **Retires 2 October 2026.** |

The Batch API runs the identical requests for exactly half price; the only
cost is patience — "within 24 hours" nominally, in practice usually minutes
for a run this size. `npm run photos -- --batch` submits everything stale as
one job and waits, printing a `--harvest` command that can collect the job
later if the wait is interrupted. 1K and 2K resolution bill the same $0.134,
so the script asks for 1K at 16:9, which is already wider than the 1200 px it
stores.

### The $10 credit, and its deadline

A **Google AI Pro** subscription includes **$10/month in Google Cloud credits**
that can be spent on the Gemini API. That is separate from the app subscription
itself, and it is what makes this free rather than cheap: $1.83 against $10.

**This subscription runs out at the end of August 2026.** After that the credits
stop arriving and a run bills the project's own payment method, or fails if
there is none. Generate the pictures before then, or expect to pay about two
dollars for them.

### Guards, so it cannot quietly cost more

- Every run **prints its estimate before spending anything**.
- `--max-spend` refuses to start when the estimate exceeds it, and stops
  mid-run before the next image would cross it. It defaults to **$5**, so the
  ceiling is half the credit even if nobody passes the flag.
- That default sits deliberately between the two full-collection prices: a
  $3.15 batch run passes, a $6.30 interactive one stops until someone types
  `--max-spend 7` on purpose.
- Recipes already carrying a current picture are skipped, so re-running costs
  nothing.
- A model with no recorded price refuses to run at all rather than spending an
  unknown amount.

```bash
npm run photos -- --max-spend 2      # refuse to go over $2
npm run photos -- --limit 5          # five recipes, to see what they look like
npm run photos -- --dry-run          # the prompts, no key and no cost
```

### Free tier

There is none for the image models — any of them. All four were probed with a
real free-tier key on 2026-08-22 and every one refuses the **first** request
with a 429 naming a free-tier quota of **zero**; the pricing page marks each
one "Not available" on the free tier. Text models still have a free tier;
pictures bill from the first one, and a key with no billing attached
generates nothing at all.

So billing must be attached to the key's project before anything generates:
[aistudio.google.com](https://aistudio.google.com) links each project to the
Cloud console's billing setup. With the Google AI Pro credits above, attached
billing still costs nothing out of pocket until the credits lapse — and a
credit that lapses unused bought nothing, which is the argument for spending
it on the best model while it lasts. The script's 429 backoff and
`--throttle` spacing remain for the *paid* tier's per-minute limits.

### The free options that do exist

- **A photograph you took**, via `npm run photo:add` (below). No key, no
  network, no cost, and better than anything generated — it is evidence.
- **Generating by hand in [AI Studio](https://aistudio.google.com) or the
  Gemini app**, which give a signed-in person a daily consumer allowance the
  API does not get. `npm run photos -- --dry-run` prints every recipe's exact
  prompt; paste one, download the result, and ingest it with the honest
  credit written out:

  ```bash
  npm run photo:add -- mango-pudding ~/Downloads/result.png \
    --credit "Generated image · Google gemini-3-pro-image (Nano Banana Pro)"
  ```

  Free in money, expensive in attention: forty-seven prompts by hand.
- **The placeholder.** Every card without a photo renders its deterministic
  gradient and glyph, so the site is complete with no pictures at all. Zero
  cost is the floor the design stands on, not a failure state.

---

## Getting a key

1. [aistudio.google.com](https://aistudio.google.com) → **Get API key** →
   **Create API key**. The default project is fine.
2. Put it in `.env`, which is gitignored:

   ```bash
   echo 'GEMINI_API_KEY=...' >> .env
   ```

   The script reads `.env` itself. An exported variable or an inline
   `GEMINI_API_KEY=... npm run photos` also works and takes precedence.

   Write that file from Git Bash or a UTF-8 editor, not PowerShell:
   PowerShell's `>` and `>>` produce UTF-16, which Node's `.env` parser reads
   as nothing at all. The key then looks set and is not.

3. Attach billing to the key's project — the image models have no free tier
   (below), and a fresh key starts on it.

**The key is a secret, never enters the repository, and never leaves the
owner's machine.** It is used in exactly one way: in the header of a request
from this machine to Google's API. It goes into no CI secret — the workflows
run keyless, on committed results only — into no other service, and into no
output (the scripts never log it, and the hook below reports line numbers,
never text). `.gitignore` covers
`.env*`, and `scripts/no-api-keys.sh` runs as a pre-commit hook that refuses any
commit containing a string shaped like a Google or Anthropic key. That hook is
installed per clone and does nothing until you run:

```bash
uvx pre-commit install
```

Do that once, in every clone, before the first commit. An uninstalled hook
protects nothing.

---

## Running it

```bash
npm install                                  # sharp does the WebP conversion
npm run photos -- --only mango-pudding       # one first, $0.13, seconds
npm run photos -- --batch                    # the rest at half price, ~$3.15

# Or the whole collection for about eighty cents:
GEMINI_IMAGE_MODEL=gemini-3.1-flash-lite-image npm run photos -- --batch

git add public/photos content/recipes
git commit -m "Add generated photos"
git push
```

`public/photos/` is **deliberately not gitignored**. A static site has no blob
store, so the images are the deployed artefact — ignoring them would build a
site whose every picture 404s, with nothing failing until somebody looked.

### After 2 October 2026

Nothing: the default is already `gemini-3-pro-image`. The date matters only to
runs pinned to the cheap model with
`GEMINI_IMAGE_MODEL=gemini-2.5-flash-image`, which stops answering that day —
from then on the override 404s and should simply be dropped.

---

## Putting a real photograph on a recipe

```bash
npm run photo:add -- mango-pudding ~/Pictures/IMG_4823.jpg --credit "Photo by Kyle"
```

Takes anything sharp can read, applies the EXIF rotation before cropping — the
difference between a phone photo standing upright and lying on its side — and
clears the generated-photo fingerprint. `photos.ts` treats a photo with no
fingerprint as human-supplied and never draws over it, not even with
`--force`; delete the recipe's `photo:` line to hand the slot back to the
generator.

`--credit` is optional and free text. Leave it off and the page shows no credit
line, which is right for your own photograph on your own site.

---

## How the prompt is built

> The rules behind it, and the five faults in the first batch that produced
> them, are in the repo-local skill at
> [`.claude/skills/recipe-photos/SKILL.md`](../.claude/skills/recipe-photos/SKILL.md).
> Read that before changing anything here.


From the recipe's description and its **final step**, not its title. Six steamed
pork patties differ by one ingredient and would otherwise all come back as the
same photograph; the last step is where a recipe says what the dish looks like
on the plate.

The instructions after that are all negative — no text, no hands, no props, no
artificial steam, no garnishes the recipe did not ask for — because left alone
these models produce restaurant styling, and this is a book about what comes out
of a domestic pan.

Editing the prompt changes every recipe's fingerprint, so the next run redraws
the whole collection. That is a deliberate $3.15 batched ($6.30 interactive)
and worth checking `--dry-run` first.

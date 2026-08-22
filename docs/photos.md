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

**As of August 2026 the whole collection costs about $1.83.**

| Model | Per image | 47 recipes | Notes |
| --- | --- | --- | --- |
| `gemini-2.5-flash-image` | ~$0.039 | ~$1.83 | The default. **Retires 2 October 2026.** |
| `gemini-3-pro-image` | ~$0.134 | ~$6.30 | Nano Banana Pro. Sharper. What to switch to. |

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

A key with no billing attached is on the free tier: rate limited to
single-digit requests a minute, and Google may use free-tier content to improve
its products. The script handles the rate limit — six seconds between images by
default, and a 429 is waited out with doubling backoff rather than failing —
so a free-tier run works, it just takes four minutes. `--throttle 0` turns the
spacing off once billing is attached.

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

**The key is a secret and never enters the repository.** `.gitignore` covers
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
npm run photos -- --only mango-pudding       # one first, $0.04
npm run photos                               # the rest, ~4 minutes

git add public/photos content/recipes
git commit -m "Add generated photos"
git push
```

`public/photos/` is **deliberately not gitignored**. A static site has no blob
store, so the images are the deployed artefact — ignoring them would build a
site whose every picture 404s, with nothing failing until somebody looked.

### After 2 October 2026

`gemini-2.5-flash-image` stops answering and runs fail with a 404. Change the
default in `scripts/photos.ts` to `gemini-3-pro-image`, or set
`GEMINI_IMAGE_MODEL=gemini-3-pro-image` for one run. Expect $6.30 rather than
$1.83 for a full regeneration.

---

## Putting a real photograph on a recipe

```bash
npm run photo:add -- mango-pudding ~/Pictures/IMG_4823.jpg --credit "Photo by Kyle"
```

Takes anything sharp can read, applies the EXIF rotation before cropping — the
difference between a phone photo standing upright and lying on its side — and
clears the generated-photo fingerprint, so `npm run photos` will never draw over
it.

`--credit` is optional and free text. Leave it off and the page shows no credit
line, which is right for your own photograph on your own site.

---

## How the prompt is built

From the recipe's description and its **final step**, not its title. Six steamed
pork patties differ by one ingredient and would otherwise all come back as the
same photograph; the last step is where a recipe says what the dish looks like
on the plate.

The instructions after that are all negative — no text, no hands, no props, no
artificial steam, no garnishes the recipe did not ask for — because left alone
these models produce restaurant styling, and this is a book about what comes out
of a domestic pan.

Editing the prompt changes every recipe's fingerprint, so the next run redraws
the whole collection. That is a deliberate $1.83 and worth checking `--dry-run`
first.

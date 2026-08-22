/**
 * Generating a picture for every recipe, once, at authoring time.
 *
 * The same shape as `translate.ts` and for the same reason: this site is a
 * static export with nothing that can hold a key at read time. The call is made
 * here, on the owner's machine — the key lives in `.env` and never leaves that
 * machine, so CI stays keyless forever and only ever sees the committed
 * results. Nothing costs anything when a recipe is read and nothing can fail
 * there either.
 *
 * ## These pictures are generated, and the site says so
 *
 * An image model has never cooked anything. What comes back is a plausible
 * photograph of a dish that matches the words, not a photograph of this dish
 * made from this recipe — so it cannot be evidence of anything. It is
 * decoration, and a collection this careful about not lying elsewhere (the
 * attribution comes from git so nobody can fill it in wrong; a coverage gap is
 * shown rather than rounded away) has to say which one it is.
 *
 * So every generated image is credited on the page as generated, by name and
 * model, in the same place a photographer would have been credited. That line
 * is not optional and is not a disclaimer bolted on: it is the honest answer to
 * "where did this picture come from", which is the question the credit line
 * already existed to answer.
 *
 * ## Not regenerating what has not changed
 *
 * Each recipe records a `photoPrompt` hash beside its photo. A run skips any
 * recipe whose hash still matches, so editing one recipe regenerates one
 * picture and a run that dies halfway can simply be run again. `--force`
 * overrides it when the prompt itself has improved.
 *
 * ## Two ways to pay for the same pictures
 *
 * The interactive endpoint returns each image in seconds at list price. The
 * Batch API takes the whole run as one job, completes it "within 24 hours" (a
 * run this size is usually minutes), and bills exactly half. `--batch` submits
 * everything stale and waits; `--harvest <name>` collects a job created
 * earlier, so a killed process loses nothing that was paid for.
 *
 * Usage:
 *   npm run photos                          # every stale recipe, interactive
 *   npm run photos -- --batch               # the same images at half price
 *   npm run photos -- --harvest batches/…   # collect an earlier --batch run
 *   npm run photos -- --only mango-pudding
 *   npm run photos -- --force --limit 5
 *   npm run photos -- --throttle 0          # paid key, no waiting
 *   npm run photos -- --max-spend 2         # refuse to go over $2
 *   npm run photos -- --dry-run
 *   GEMINI_IMAGE_MODEL=gemini-2.5-flash-image npm run photos
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  parseRecipeFile,
  serialiseRecipeFile,
  type RecipeFile,
} from "../src/lib/content/format";

const RECIPES_DIR = join("content", "recipes");
const PHOTOS_DIR = join("public", "photos");

/**
 * Nano Banana, which is what everyone calls Google's image models and what the
 * request that led to this file said.
 *
 * Four of them exist now and the choice is a real one (list / batch price per
 * image, checked 2026-08-22 at ai.google.dev/gemini-api/docs/pricing):
 *
 *   - `gemini-3-pro-image` — Nano Banana Pro, $0.134 / $0.067. The default:
 *     asked for by name, and the best of them at composition and at not
 *     inventing garnishes.
 *   - `gemini-3.1-flash-image` — Nano Banana 2, $0.067 / $0.034.
 *   - `gemini-3.1-flash-lite-image` — Nano Banana 2 Lite, $0.0336 / $0.0168:
 *     the whole collection for about eighty cents, batched.
 *   - `gemini-2.5-flash-image` — the original, $0.039 / $0.020. It **retires
 *     on 2 October 2026** and 404s from then on.
 *
 * None of them has a free tier. All four were probed with this project's key
 * on 2026-08-22, and each one 429s a *first* request against a free-tier
 * quota of zero — so a key with no billing attached generates nothing at all,
 * and every image bills from the first.
 *
 * Override with GEMINI_IMAGE_MODEL rather than editing this line, so a run can
 * pick any of them without a commit.
 */
const MODEL = process.env["GEMINI_IMAGE_MODEL"] ?? "gemini-3-pro-image";

/**
 * Published price per image, for the estimate printed before a run and the
 * `--max-spend` ceiling.
 *
 * Not authoritative — it exists so the run says what it is about to cost
 * before it costs it, rather than after. Checked 2026-08-22 at
 * ai.google.dev/gemini-api/docs/pricing.
 */
const PRICE_PER_IMAGE: Record<string, number> = {
  "gemini-2.5-flash-image": 0.039,
  "gemini-3-pro-image": 0.134,
  // 1K rates; gemini-3.1-flash-image also sells a 0.5K tier ($0.045) that
  // this script never requests — 512 px is below the 1200 px stored here.
  "gemini-3.1-flash-image": 0.067,
  "gemini-3.1-flash-lite-image": 0.0336,
};

/** The Batch API bills the same images at half list price (same page). */
const BATCH_DISCOUNT = 0.5;

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const ENDPOINT = `${BASE}/models/${MODEL}:generateContent`;

/**
 * What the credit line says. Kept here so one edit changes every recipe.
 *
 * The model is named rather than left vague, because "generated" alone does not
 * say by what, and in a year it will matter which.
 */
const NICKNAME = MODEL.startsWith("gemini-3-pro-image")
  ? "Nano Banana Pro"
  : MODEL.startsWith("gemini-3.1-flash-lite-image")
    ? "Nano Banana 2 Lite"
    : MODEL.startsWith("gemini-3.1-flash-image")
      ? "Nano Banana 2"
      : "Nano Banana";
const CREDIT = `Generated image · Google ${MODEL} (${NICKNAME})`;

/**
 * Card images are 4:3 and the hero is 16:9, both at modest sizes on a phone.
 * 1200 px wide covers a 2x display at the hero's width and nothing more. The
 * pro model is asked for 16:9 outright (see `generationConfig`); the flash
 * model only produces squares, which are cropped to shape here instead.
 */
const WIDTH = 1200;
const HEIGHT = 675;
const QUALITY = 78;

/**
 * The generation settings, which differ by model family.
 *
 * The gemini-3 family (Pro, 2, 2 Lite) thinks in text before it draws, and
 * its documented requests ask for TEXT and IMAGE together; the text parts are
 * read past and only the image is kept. It also honours an aspect ratio, so
 * the 16:9 the site stores is requested rather than cut out of a square. Size
 * stays at 1K deliberately: on the pro model 1K and 2K bill the same, a 1K
 * 16:9 frame is already wider than the 1200 px stored here, and a whole
 * collection of 2K PNGs quadruples the batch download for pixels sharp would
 * immediately throw away. 1K is also the largest size the 3.1 models sell.
 *
 * The 2.5 flash model predates all of that: IMAGE alone, square output.
 */
function generationConfig(): Record<string, unknown> {
  return /^gemini-3.*image/.test(MODEL)
    ? {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
      }
    : { responseModalities: ["IMAGE"] };
}

interface Args {
  force: boolean;
  dryRun: boolean;
  /** Submit everything stale as one half-price Batch API job and wait for it. */
  batch: boolean;
  /** A batch name from an earlier `--batch` run, to collect without re-paying. */
  harvest: string | null;
  only: string | null;
  limit: number | null;
  /** Seconds to wait between images, to stay under a free key's rate limit. */
  throttle: number;
  /** Dollars this run refuses to exceed. */
  maxSpend: number;
}

function parseArgs(argv: string[]): Args {
  const at = (flag: string) => argv.indexOf(flag);
  const value = (flag: string): string | null => {
    const index = at(flag);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const limit = value("--limit");
  const throttle = value("--throttle");
  const maxSpend = value("--max-spend");
  return {
    force: at("--force") !== -1,
    dryRun: at("--dry-run") !== -1,
    batch: at("--batch") !== -1,
    harvest: value("--harvest"),
    only: value("--only"),
    limit: limit === null ? null : Number(limit),
    // Six seconds is ten requests a minute, under the free tier's floor. It
    // costs four minutes across the whole collection and removes the commonest
    // reason a run half-fails.
    throttle: throttle === null ? 6 : Number(throttle),
    // Five dollars against a ten dollar credit. The full collection is about
    // $3.15 through the Batch API and $6.30 interactive, so the default lets a
    // batch run pass and stops a full-price interactive run for an explicit
    // decision — as well as anything genuinely wrong, like a model priced
    // differently than expected or a loop that is not stopping.
    maxSpend: maxSpend === null ? 5 : Number(maxSpend),
  };
}

/**
 * What the model is told to draw.
 *
 * Built from the recipe rather than from its title alone, because a title is
 * not a description of a plate: "Steamed Pork Patty with Zha Cai" and "Steamed
 * Pork Patty with Salted Fish" differ by one ingredient and would otherwise
 * come back as the same picture. The description and the finishing step carry
 * what the dish actually looks like when it is done, which is the thing being
 * asked for.
 *
 * The instructions at the end are all negative for a reason: left alone, food
 * models produce restaurant styling — garnishes nobody listed, props, steam
 * added in post — and a recipe collection wants the dish as it comes out of the
 * pan in a domestic kitchen.
 */
export function promptFor(recipe: RecipeFile): string {
  const finish = recipe.steps.at(-1) ?? "";
  const lines = [
    `A photograph of one dish: ${recipe.title}.`,
    recipe.cuisine ? `${recipe.cuisine} home cooking.` : "",
    recipe.description ? `The dish: ${recipe.description}` : "",
    `How it is served: ${finish}`,
    "",
    "Shot from a slight overhead angle on a plain matte ceramic plate or bowl,",
    "on a plain wooden or stone surface, in soft daylight from one side.",
    "Photographed as it would look cooked at home, not styled for a restaurant.",
    "",
    "Do not include: text, labels, watermarks, hands, people, cutlery arranged",
    "decoratively, branded packaging, garnishes the dish does not call for,",
    "artificial steam, or more than one dish in the frame.",
  ];
  return lines.filter((line) => line !== "").join("\n");
}

/** A prompt's fingerprint, so an unchanged recipe is not redrawn. */
function hash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

/** The inline image data out of a generateContent response. */
function imageFrom(body: unknown): Buffer {
  const parts =
    (body as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates?.[0]
      ?.content?.parts ?? [];
  for (const part of parts) {
    const data = (part as { inlineData?: { data?: string } }).inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  // A refusal comes back as a normal 200 with text where the image should be,
  // so this has to be checked rather than assumed. Saying what came back
  // instead is the difference between a fixable message and a mystery.
  const text = parts
    .map((part) => (part as { text?: string }).text ?? "")
    .join(" ")
    .trim();
  throw new Error(
    text ? `no image returned: ${text.slice(0, 300)}` : "no image in response",
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One image, with rate limits in mind.
 *
 * A 429 is waited out rather than reported, with the delay doubling each time;
 * four attempts covers a couple of minutes of backoff, which is longer than
 * any per-minute window. 500 and 503 get the same treatment for a different
 * reason: they are the shapes a busy image model returns, and they clear on
 * their own.
 *
 * A key with no billing attached also 429s, but with a quota of zero that no
 * amount of waiting changes — that one comes back after the fourth attempt
 * with Google's own "check your plan and billing" text intact.
 */
async function generate(prompt: string, key: string): Promise<Buffer> {
  let wait = 8_000;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: generationConfig(),
      }),
    });
    if (response.ok) return imageFrom(await response.json());

    const retryable = response.status === 429 || response.status >= 500;
    const body = (await response.text()).slice(0, 300);
    if (!retryable || attempt >= 4) throw new Error(`${response.status} ${body}`);
    console.log(`  ${response.status}, waiting ${wait / 1000}s`);
    await sleep(wait);
    wait *= 2;
  }
}

/** A recipe whose picture is stale, with everything a generation needs. */
interface Due {
  slug: string;
  path: string;
  recipe: RecipeFile;
  prompt: string;
  fingerprint: string;
  out: string;
}

/**
 * Write the image and stamp the recipe, identically for both endpoints.
 * Returns the stored size in kilobytes, for the caller's progress line.
 */
async function saveResult(due: Due, png: Buffer): Promise<number> {
  await sharp(png)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: QUALITY })
    .toFile(due.out);
  writeFileSync(
    due.path,
    serialiseRecipeFile({
      ...due.recipe,
      photo: `/photos/${due.slug}.webp`,
      photoCredit: { siteName: CREDIT, pageUrl: null },
      photoPrompt: due.fingerprint,
    }),
  );
  return Math.round(readFileSync(due.out).byteLength / 1024);
}

/**
 * The whole run as one Batch API job: identical requests, half the price,
 * minutes to hours instead of seconds (checked 2026-08-22; the batch docs'
 * own image-generation example is this model family).
 *
 * Each request carries its slug as `metadata.key` and results are matched by
 * that key rather than by position — the API preserves order, but a keyed
 * match cannot be silently wrong.
 */
async function createBatch(due: Due[], key: string): Promise<string> {
  const response = await fetch(`${BASE}/models/${MODEL}:batchGenerateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      batch: {
        displayName: "recipe-photos",
        inputConfig: {
          requests: {
            requests: due.map((item) => ({
              request: {
                contents: [{ parts: [{ text: item.prompt }] }],
                generationConfig: generationConfig(),
              },
              metadata: { key: item.slug },
            })),
          },
        },
      },
    }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  const name = (body as { name?: string }).name;
  if (!response.ok || !name) {
    throw new Error(
      `batch creation failed: ${response.status} ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  console.log(
    `batch ${name} accepted for ${due.length} images.\n` +
      `If this process dies, nothing paid for is lost:\n` +
      `  npm run photos -- --harvest ${name}\n`,
  );
  return name;
}

/** Poll until the job leaves its running states, then hand back its body. */
async function awaitBatch(name: string, key: string): Promise<unknown> {
  const started = Date.now();
  let lastState = "";
  for (;;) {
    const response = await fetch(`${BASE}/${name}`, {
      headers: { "x-goog-api-key": key },
    });
    if (!response.ok) {
      throw new Error(
        `polling failed: ${response.status} ${(await response.text()).slice(0, 300)}`,
      );
    }
    const body: unknown = await response.json();
    const state =
      (body as { metadata?: { state?: string } }).metadata?.state ??
      (body as { state?: string }).state ??
      "unknown";
    if (state !== lastState) {
      const minutes = Math.round((Date.now() - started) / 60_000);
      console.log(
        `  ${state.replace("JOB_STATE_", "").toLowerCase()}, ${minutes} min in`,
      );
      lastState = state;
    }
    if (state === "JOB_STATE_SUCCEEDED") return body;
    if (
      ["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"].includes(state)
    ) {
      throw new Error(`batch ended ${state}: ${JSON.stringify(body).slice(0, 300)}`);
    }
    await sleep(30_000);
  }
}

/**
 * Write out everything a finished batch contains. A result with no matching
 * recipe, or a recipe with no result, is reported rather than guessed at.
 */
async function harvestBatch(
  body: unknown,
  due: Due[],
): Promise<{ done: number; failed: number }> {
  const container = (body as { response?: { inlinedResponses?: unknown } }).response
    ?.inlinedResponses;
  // The list arrives nested one level deeper in some responses than in others;
  // accept both rather than betting on one.
  const items: unknown[] = Array.isArray(container)
    ? container
    : ((container as { inlinedResponses?: unknown[] } | undefined)?.inlinedResponses ??
      []);
  const bySlug = new Map(due.map((item) => [item.slug, item]));
  let done = 0;
  let failed = 0;
  for (const [index, raw] of items.entries()) {
    const item = raw as {
      metadata?: { key?: string };
      error?: { message?: string };
      response?: unknown;
    };
    const slug = item.metadata?.key ?? due[index]?.slug ?? `#${index}`;
    const target = bySlug.get(slug);
    if (!target) {
      console.error(`${slug}: result has no matching recipe, skipped`);
      failed += 1;
      continue;
    }
    try {
      if (item.error) throw new Error(item.error.message ?? "request failed");
      const kb = await saveResult(target, imageFrom(item.response));
      console.log(`${slug}: ${kb} kB`);
      done += 1;
    } catch (error) {
      console.error(`${slug}: ${(error as Error).message}`);
      failed += 1;
    }
    bySlug.delete(slug);
  }
  for (const missing of bySlug.keys()) {
    console.error(`${missing}: no result in the batch`);
    failed += 1;
  }
  return { done, failed };
}

/**
 * Reads `.env`, so the key can live in a file rather than a shell history.
 *
 * Node has done this natively since 20.12, so it costs no dependency. The file
 * is optional: an environment that already has the key set — CI, or an inline
 * `GEMINI_API_KEY=... npm run photos` — needs no file and is not overridden,
 * because `loadEnvFile` does not replace variables that are already set.
 *
 * The file must be UTF-8. A `.env` written by PowerShell's `>` redirect is
 * UTF-16 and parses as nothing at all — silently, because a malformed .env
 * must not stop a run whose key is already exported. If the key is "not set"
 * while visibly in the file, that is what has happened.
 */
function loadDotEnv(): void {
  if (!existsSync(".env")) return;
  try {
    process.loadEnvFile(".env");
  } catch {
    // A malformed .env should not stop a run whose key is already exported.
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotEnv();
  const key = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"] ?? "";
  if (!key && !args.dryRun) {
    console.error(
      "GEMINI_API_KEY is not set.\n" +
        "Put it in .env (already gitignored) or the environment, then run again.\n" +
        "Run with --dry-run to see the prompts without a key.",
    );
    process.exit(1);
  }

  mkdirSync(PHOTOS_DIR, { recursive: true });

  // Only the English originals: a translation is the same dish.
  const files = readdirSync(RECIPES_DIR)
    .filter((name) => name.endsWith(".md") && name.split(".").length === 2)
    .sort();

  // First pass: decide what is stale, without generating anything.
  const due: Due[] = [];
  let skipped = 0;
  let failed = 0;
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (args.only && slug !== args.only) continue;
    if (args.limit !== null && due.length >= args.limit) break;

    const path = join(RECIPES_DIR, file);
    const parsed = parseRecipeFile(slug, readFileSync(path, "utf8"));
    if (!parsed.ok) {
      console.error(`${slug}: unreadable — ${parsed.error}`);
      failed += 1;
      continue;
    }
    const recipe = parsed.recipe;
    // A photograph a person supplied has a photo but no prompt fingerprint —
    // photo-add clears it on purpose. It outranks generation permanently: not
    // even --force redraws over it. To hand the slot back to the generator,
    // delete the recipe's `photo:` line.
    if (recipe.photo !== null && recipe.photoPrompt === null) {
      skipped += 1;
      continue;
    }
    const prompt = promptFor(recipe);
    const fingerprint = hash(prompt);
    const out = join(PHOTOS_DIR, `${slug}.webp`);
    if (!args.force && recipe.photoPrompt === fingerprint && existsSync(out)) {
      skipped += 1;
      continue;
    }
    due.push({ slug, path, recipe, prompt, fingerprint, out });
  }

  if (args.dryRun) {
    for (const item of due) console.log(`\n--- ${item.slug}\n${item.prompt}`);
    console.log(`\n${due.length} would be generated, ${skipped} unchanged.`);
    return;
  }

  // Say what it is about to cost before it costs it, and refuse over-ceiling
  // runs outright. A harvest bills nothing new: its job was priced and paid
  // for when it was created.
  const listPrice = PRICE_PER_IMAGE[MODEL];
  const rate =
    listPrice === undefined ? undefined : listPrice * (args.batch ? BATCH_DISCOUNT : 1);
  if (args.harvest === null) {
    const estimate = rate === undefined ? null : due.length * rate;
    console.log(
      `${MODEL}: ${due.length} stale of ${files.length} recipes, about ` +
        `${estimate === null ? "an unknown amount" : `$${estimate.toFixed(2)}`} at ` +
        `${args.batch ? "the batch rate" : "list price"}.\n`,
    );
    if (estimate !== null && estimate > args.maxSpend) {
      console.error(
        `That is over the --max-spend ceiling of $${args.maxSpend.toFixed(2)}, so nothing has run.\n` +
          `Raise it deliberately, or use --limit to do part of the collection.`,
      );
      process.exit(1);
    }
    if (rate === undefined) {
      console.error(
        `No published price is recorded for ${MODEL}, so this run cannot check itself\n` +
          `against the ceiling. Add it to PRICE_PER_IMAGE, or run with --dry-run first.`,
      );
      process.exit(1);
    }
  }

  let done = 0;
  let spent = 0;
  if (due.length === 0) {
    // Nothing stale; fall through to the summary.
  } else if (args.harvest !== null) {
    const body = await awaitBatch(args.harvest, key);
    const result = await harvestBatch(body, due);
    done = result.done;
    failed += result.failed;
  } else if (args.batch) {
    const name = await createBatch(due, key);
    const body = await awaitBatch(name, key);
    const result = await harvestBatch(body, due);
    done = result.done;
    failed += result.failed;
    spent = done * (rate ?? 0);
  } else {
    let first = true;
    for (const item of due) {
      // Checked before each image rather than only at the start, because a
      // resumed run is cheaper than the estimate assumed — but a mistake in
      // the other direction should still stop here rather than at the end,
      // when the money is already gone.
      if (rate !== undefined && spent + rate > args.maxSpend) {
        console.error(
          `\nStopping at $${spent.toFixed(2)}: one more image would pass the ` +
            `$${args.maxSpend.toFixed(2)} ceiling.`,
        );
        break;
      }
      try {
        // Between images, not before the first: a one-recipe run should not
        // sit there for six seconds doing nothing.
        if (!first && args.throttle > 0) await sleep(args.throttle * 1000);
        first = false;
        const png = await generate(item.prompt, key);
        const kb = await saveResult(item, png);
        spent += rate ?? 0;
        console.log(`${item.slug}: ${kb} kB  ($${spent.toFixed(2)} so far)`);
        done += 1;
      } catch (error) {
        console.error(`${item.slug}: ${(error as Error).message}`);
        failed += 1;
      }
    }
  }

  console.log(
    `\n${done} generated, ${skipped} unchanged, ${failed} failed.` +
      (args.harvest !== null
        ? ""
        : ` About $${spent.toFixed(2)} at ${args.batch ? "the batch rate" : "list price"}.`),
  );
  if (failed > 0) process.exit(1);
}

void main();

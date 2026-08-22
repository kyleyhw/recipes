/**
 * Generating a picture for every recipe, once, at authoring time.
 *
 * The same shape as `translate.ts` and for the same reason: this site is a
 * static export with nothing that can hold a key at read time. The call is made
 * here, by a person or by CI, the result is committed as a file, and the site
 * serves it like any other asset. Nothing costs anything when a recipe is read
 * and nothing can fail there either.
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
 * Usage:
 *   GEMINI_API_KEY=... npm run photos
 *   GEMINI_API_KEY=... npm run photos -- --only mango-pudding
 *   GEMINI_API_KEY=... GEMINI_IMAGE_MODEL=gemini-2.5-flash-image npm run photos
 *   GEMINI_API_KEY=... npm run photos -- --force --limit 5
 *   GEMINI_API_KEY=... npm run photos -- --throttle 0     # paid key, no waiting
 *   GEMINI_API_KEY=... npm run photos -- --max-spend 2     # refuse to go over $2
 *   GEMINI_API_KEY=... npm run photos -- --dry-run
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
 * Two of them exist and the choice is a real one:
 *
 *   - `gemini-2.5-flash-image` — the original, about $0.039 an image, and the
 *     default because it is a third of the price and this collection is 47
 *     pictures of dinner rather than a print campaign. It **retires on
 *     2 October 2026**, and on that day this script starts failing with a 404
 *     until the line below is changed. That is a deliberate trade: cheap now,
 *     one edit later.
 *   - `gemini-3-pro-image` — Nano Banana Pro, general since June 2026, about
 *     $0.134 an image, sharper and much better at text. What to switch to in
 *     October, or sooner if the cheap one disappoints.
 *
 * Override with GEMINI_IMAGE_MODEL rather than editing this line, so a run can
 * pick either without a commit.
 */
const MODEL = process.env["GEMINI_IMAGE_MODEL"] ?? "gemini-2.5-flash-image";

/**
 * Published price per image, for the estimate printed before a run.
 *
 * Not authoritative and not used for anything but that line — it exists so the
 * run says what it is about to cost before it costs it, rather than after.
 */
const PRICE_PER_IMAGE: Record<string, number> = {
  "gemini-2.5-flash-image": 0.039,
  "gemini-3-pro-image": 0.134,
};
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * What the credit line says. Kept here so one edit changes every recipe.
 *
 * The model is named rather than left vague, because "generated" alone does not
 * say by what, and in a year it will matter which.
 */
const CREDIT = `Generated image · Google ${MODEL} (Nano Banana)`;

/**
 * Card images are 4:3 and the hero is 16:9, both at modest sizes on a phone.
 * 1200 px wide covers a 2x display at the hero's width and nothing more; the
 * model's own output is square, so it is cropped to the hero's shape here
 * rather than being asked for a shape it does not reliably produce.
 */
const WIDTH = 1200;
const HEIGHT = 675;
const QUALITY = 78;

interface Args {
  force: boolean;
  dryRun: boolean;
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
    only: value("--only"),
    limit: limit === null ? null : Number(limit),
    // Six seconds is ten requests a minute, under the free tier's floor. It
    // costs four minutes across the whole collection and removes the commonest
    // reason a run half-fails.
    throttle: throttle === null ? 6 : Number(throttle),
    // Five dollars against a ten dollar credit. The whole collection is under
    // two, so this only ever fires when something is wrong — a model priced
    // differently than expected, or a loop that is not stopping.
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
 * One image, with the free tier in mind.
 *
 * A key with no billing attached is rate limited to single-digit requests a
 * minute, and forty-seven recipes in a loop will walk straight into that. A 429
 * there is not a failure, it is the tier working as designed — so it is waited
 * out rather than reported, with the delay doubling each time. Four attempts
 * covers a couple of minutes of backoff, which is longer than any per-minute
 * window.
 *
 * 500 and 503 get the same treatment for a different reason: they are the
 * shapes a busy image model returns, and they clear on their own.
 */
async function generate(prompt: string, key: string): Promise<Buffer> {
  let wait = 8_000;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
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

/**
 * Reads `.env`, so the key can live in a file rather than a shell history.
 *
 * Node has done this natively since 20.12, so it costs no dependency. The file
 * is optional: an environment that already has the key set — CI, or an inline
 * `GEMINI_API_KEY=... npm run photos` — needs no file and is not overridden,
 * because `loadEnvFile` does not replace variables that are already set.
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

  const price = PRICE_PER_IMAGE[MODEL];
  const due = files.filter((file) => !args.only || file === `${args.only}.md`).length;
  if (!args.dryRun) {
    const estimate = price === undefined ? null : due * price;
    console.log(
      `${MODEL}: up to ${due} images, about ` +
        `${estimate === null ? "an unknown amount" : `$${estimate.toFixed(2)}`} at list price.\n` +
        `Already-current recipes are skipped, so the real number is usually lower.\n`,
    );
    if (estimate !== null && estimate > args.maxSpend) {
      console.error(
        `That is over the --max-spend ceiling of $${args.maxSpend.toFixed(2)}, so nothing has run.\n` +
          `Raise it deliberately, or use --limit to do part of the collection.`,
      );
      process.exit(1);
    }
    if (price === undefined) {
      console.error(
        `No published price is recorded for ${MODEL}, so this run cannot check itself\n` +
          `against the ceiling. Add it to PRICE_PER_IMAGE, or run with --dry-run first.`,
      );
      process.exit(1);
    }
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let first = true;
  let spent = 0;

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (args.only && slug !== args.only) continue;
    if (args.limit !== null && done >= args.limit) break;

    const path = join(RECIPES_DIR, file);
    const parsed = parseRecipeFile(slug, readFileSync(path, "utf8"));
    if (!parsed.ok) {
      console.error(`${slug}: unreadable — ${parsed.error}`);
      failed += 1;
      continue;
    }
    const recipe = parsed.recipe;
    const prompt = promptFor(recipe);
    const fingerprint = hash(prompt);
    const out = join(PHOTOS_DIR, `${slug}.webp`);

    if (!args.force && recipe.photoPrompt === fingerprint && existsSync(out)) {
      skipped += 1;
      continue;
    }

    if (args.dryRun) {
      console.log(`\n--- ${slug}\n${prompt}`);
      done += 1;
      continue;
    }

    // Checked before each image rather than only at the start, because the
    // estimate assumes every recipe is due and a resumed run is cheaper than
    // that — but a mistake in the other direction should still stop here
    // rather than at the end, when the money is already gone.
    if (price !== undefined && spent + price > args.maxSpend) {
      console.error(
        `\nStopping at $${spent.toFixed(2)}: one more image would pass the ` +
          `$${args.maxSpend.toFixed(2)} ceiling.`,
      );
      break;
    }

    try {
      // Between images, not before the first: a one-recipe run should not sit
      // there for six seconds doing nothing.
      if (!first && args.throttle > 0) await sleep(args.throttle * 1000);
      first = false;
      const png = await generate(prompt, key);
      await sharp(png)
        .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
        .webp({ quality: QUALITY })
        .toFile(out);

      writeFileSync(
        path,
        serialiseRecipeFile({
          ...recipe,
          photo: `/photos/${slug}.webp`,
          photoCredit: { siteName: CREDIT, pageUrl: null },
          photoPrompt: fingerprint,
        }),
      );
      const kb = Math.round(readFileSync(out).byteLength / 1024);
      spent += price ?? 0;
      console.log(`${slug}: ${kb} kB  ($${spent.toFixed(2)} so far)`);
      done += 1;
    } catch (error) {
      console.error(`${slug}: ${(error as Error).message}`);
      failed += 1;
    }
  }

  console.log(
    `\n${done} generated, ${skipped} unchanged, ${failed} failed. ` +
      `About $${spent.toFixed(2)} at list price.`,
  );
  if (failed > 0) process.exit(1);
}

void main();

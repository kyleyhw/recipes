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
 * recipe whose hash still matches, so a run that dies halfway can simply be run
 * again.
 *
 * A plain run draws only recipes with **no picture at all**, and that is the
 * default rather than a flag. Nothing is redrawn on its own initiative: not a
 * recipe whose text has changed since its picture was made, and not the whole
 * book when the prompt in this file is edited. Both of those are *reported* —
 * see `reportChanged` — because a picture that no longer matches its recipe is
 * worth knowing about, and neither is acted on, because redrawing eighty-six
 * images is a decision with a price on it and it belongs to the person running
 * this, not to the script.
 *
 * `--changed` draws the recipes whose text has moved on. `--force` draws
 * everything. Both are explicit and both print what they are about to cost.
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
 *   npm run photos                          # only recipes with no picture yet
 *   npm run photos -- --changed             # also the ones edited since drawing
 *   npm run photos -- --missing             # the default, said out loud
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
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  parseRecipeFile,
  serialiseRecipeFile,
  type RecipeFile,
} from "../src/lib/content/format";
import { parseIngredientLine } from "../src/lib/ingredient-parser";
import { changedSince, parseTouched, RECORD } from "../src/lib/photos/staleness";

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
  /**
   * Only draw recipes with no picture at all, whatever the prompt now says.
   * This is the default; the flag exists so a script can say so explicitly.
   */
  missing: boolean;
  /** Also draw recipes whose text has changed since their picture was made. */
  changed: boolean;
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
    missing: at("--missing") !== -1,
    changed: at("--changed") !== -1,
  };
}

/**
 * The one ceramic the whole collection is served in, named here so that no
 * category string can drift and so that changing it is a single deliberate act.
 *
 * It used to read "plain matte ceramic", which is what drew the first 47 and is
 * accurate about them. It stopped working when the prompt grew: against a long
 * ingredient list and a composition paragraph the model reads "plain" as "plain
 * white" and returns bright smooth bowls. Naming the glaze these bowls actually
 * have pins it where the generic phrase no longer does — see the recipe-photos
 * skill for the pictures that established this.
 */
const CERAMIC = "speckled oatmeal-grey matte stoneware";

/** The vessel a category's food sits in. Material and light never vary — only this. */
const VESSEL: Record<string, string> = {
  "Sauces & Condiments": `in a small ${CERAMIC} bowl, as a condiment, with nothing else in the frame`,
  Drinks: `in a ${CERAMIC} cup`,
  "Baked Goods": `whole on a ${CERAMIC} plate, with one slice or piece cut and set beside it`,
  "Soups & Stews": `in one deep ${CERAMIC} bowl`,
  // The deep bowl follows the noodle soups here. They were filed under Soups &
  // Stews until the collection was refiled by what a dish is made of, and
  // without this line fifteen bowls of broth would have started being drawn on
  // a flat plate. A donburi and a plate of carbonara take the same bowl well
  // enough that the whole shelf can share one.
  "Rice & Noodles": `in one deep ${CERAMIC} bowl`,
};
// Both nouns carry the material. Qualifying only the first one leaves "shallow
// bowl" free to be any bowl, and the model picks a bright white glazed one.
const DEFAULT_VESSEL = `on one ${CERAMIC} plate or in one shallow ${CERAMIC} bowl`;

/**
 * Things that go in at the end but cannot be seen, so are not a garnish.
 *
 * The diagram cannot tell a scattering of spring onion from a spoon of sugar
 * stirred into a cup of tea — both are leaves on the root. Listing the second
 * as a finish invites the model to draw sugar crystals on top of the drink.
 */
const INVISIBLE_FINISH = new Set([
  "salt",
  "granulated sugar",
  "caster sugar",
  "brown sugar",
  "water",
  "msg",
]);

/** Words whose absence from a method means nothing in the dish is browned. */
const BROWNING =
  /\b(fry|fried|frying|sear|seared|brown|browned|browning|roast|roasted|char|charred|grill|grilled|caramelis|toast|toasted|bake|baked)\b/i;

/**
 * The ingredients that go on at the end, taken from the diagram.
 *
 * The root operation's leaf children are the garnish by construction — that is
 * what the outline means — so this is exact where reading it out of the last
 * method step is merely lucky. See the recipe-photos skill for the two
 * photographs that went wrong before this existed.
 */
export function garnishesFrom(diagram: readonly string[]): string[] {
  const rows = diagram
    .map((line) => ({
      depth: (line.match(/^ */)?.[0].length ?? 0) / 2,
      text: line.replace(/^\s*-\s*/, "").trim(),
    }))
    .filter((row) => row.text !== "");
  return rows
    .filter(
      (row, index) => row.depth === 1 && (rows[index + 1]?.depth ?? 0) <= 1,
      // depth 1 is a direct child of the root; nothing deeper beneath it means
      // it is a leaf, and a leaf at that depth is something added at the end.
    )
    .map((row) => row.text.replace(/^\d+\/\d+\s+/, ""));
}

/**
 * What the model is told to draw.
 *
 * Built from the recipe rather than from its title alone, because a title is
 * not a description of a plate: "Steamed Pork Patty with Zha Cai" and "Steamed
 * Pork Patty with Salted Fish" differ by one ingredient and would otherwise
 * come back as the same picture.
 *
 * The ingredient list is passed because without it the model invents plausible
 * contents — the first banana bread came back with chocolate chips in it. The
 * garnish comes from the diagram because the last method step is only sometimes
 * about plating. Both faults, and the reasoning, are written up in the
 * recipe-photos skill.
 *
 * The instructions at the end are all negative for a reason: left alone, food
 * models produce restaurant styling — garnishes nobody listed, props, steam
 * added in post — and a recipe collection wants the dish as it comes out of the
 * pan in a domestic kitchen.
 */
export function promptFor(recipe: RecipeFile): string {
  // Brackets are a note to the reader — "walnuts (a small handful)" — and an
  // image model reads them as something to draw.
  const clean = (name: string) =>
    name
      .replace(/\(.*?\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const ingredients = [
    ...new Set(recipe.ingredients.map((line) => clean(parseIngredientLine(line).name))),
  ];
  const garnish = garnishesFrom(recipe.diagram)
    .map(clean)
    .filter((name) => !INVISIBLE_FINISH.has(name.toLowerCase()));
  const method = recipe.steps.join(" ");
  const vessel = VESSEL[recipe.category] ?? DEFAULT_VESSEL;
  // Only where a step actually names one; otherwise the frame holds one dish.
  const accompaniment = /\bwith (plain |hot |steamed )?rice\b/i.test(method)
    ? "A small bowl of plain white rice may sit beside it."
    : "";

  const lines = [
    `A photograph of one dish: ${recipe.title}.`,
    recipe.cuisine ? `${recipe.cuisine} home cooking.` : "",
    recipe.description ? `The dish: ${recipe.description}` : "",
    `It contains only these things and nothing else: ${ingredients.join(", ")}.`,
    garnish.length > 0 ? `Finished at the last moment with: ${garnish.join(", ")}.` : "",
    // "it should look pale" gives the adjective no owner, and the model reads
    // it as governing the picture: the surface goes pale flat tan, the ceramic
    // goes white and the side light flattens out. Binding "pale" to the food as
    // its subject keeps the instruction on the plate, where rule 4 wants it.
    // "The food itself is pale" overreached: it is true of a custard and false
    // of anything cold and coloured — it bleached sangria's red wine to amber
    // and ohitashi's spinach to lettuce-green in one batch. What rule 4
    // actually needs said is the browning half, which is true of every dish
    // this line fires for. The subject stays bound ("nothing in it") so the
    // instruction cannot leak onto the surface, the ceramic or the light.
    BROWNING.test(method) ? "" : "Nothing in it is browned, charred or coloured by heat.",
    "",
    // "wooden or stone" offered a branch none of the first 47 ever took, and a
    // pale flat stone slab is exactly the surface that came back when the model
    // took it. "One side" is likewise a choice the collection never varies: the
    // light rakes in from the left in all 47. Neither is a new look — both name
    // the one the collection already has and close the door on the other.
    //
    // It must stay "surface". "Board" reads as a chopping board: an object with
    // edges, sitting on a white counter that then shows at the frame's edge. Two
    // of three test pictures came back that way before this word went back.
    // "Slight overhead angle" alone held for plated dishes and stopped holding
    // for baked goods: cookies and croissants came back dead top-down, the
    // flat-lay convention for that subject winning over a phrase with no number
    // in it. Thirty to forty-five degrees is not a new look — it is what the
    // first 47 already measure — and "never straight down" closes the door the
    // way "surface" and "from the left" close theirs.
    `Shot from a slight overhead angle, thirty to forty-five degrees above the`,
    `horizontal and never straight down, ${vessel},`,
    "on a weathered warm-brown wooden surface with visible grain, filling the",
    "background, in soft daylight from the left.",
    "Photographed as it would look cooked at home, not styled for a restaurant.",
    accompaniment,
    "",
    "Compose it centred and filling the frame. Keep the dish and anything else",
    "that matters out of the outer eighth of the left and right edges, which is",
    "cropped away when the picture is shown as a card.",
    "",
    "Do not include: text, labels, watermarks, hands, people, cutlery arranged",
    "decoratively, branded packaging, any ingredient not listed above, garnishes",
    "the dish does not call for, artificial steam, or more than one dish in the",
    "frame.",
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

/**
 * When each tracked file was last committed, in seconds since the epoch.
 *
 * One `git log` over both directories rather than one per file: the collection
 * is eighty-six recipes and as many pictures, and a call each would be three
 * hundred processes to answer a question nobody asked for.
 *
 * Returns an empty map where git cannot answer — a tarball, no git at all —
 * and the caller then reports nothing, which is the right failure: a staleness
 * warning that cannot be computed must not be guessed at.
 *
 * The parse itself is in lib/photos/staleness.ts, where it can be tested
 * without a repository.
 */
function lastTouched(): Map<string, number> {
  const git = (args: string[]): string =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

  let log: string;
  try {
    log = git([
      "log",
      `--format=${RECORD}%at`,
      "--name-only",
      "--find-renames",
      "--diff-filter=AMR",
      "--",
      RECIPES_DIR,
      PHOTOS_DIR,
    ]);
  } catch {
    return new Map();
  }

  let status = "";
  try {
    status = git(["status", "--porcelain", "--", RECIPES_DIR, PHOTOS_DIR]);
  } catch {
    // A working tree git will not describe is still a history it described.
  }

  return parseTouched(log, status);
}

/**
 * Recipes whose text has moved on since their picture was drawn.
 *
 * A report and not a trigger — see lib/photos/staleness.ts for why, and for
 * everything about this that is worth testing.
 */
function changedSinceDrawn(slugs: readonly string[]): string[] {
  return changedSince(slugs, lastTouched(), {
    recipe: (slug) => join(RECIPES_DIR, `${slug}.md`),
    photo: (slug) => join(PHOTOS_DIR, `${slug}.webp`),
  });
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
        `  ${state.replace(/^(JOB|BATCH)_STATE_/, "").toLowerCase()}, ${minutes} min in`,
      );
      lastState = state;
    }
    // The docs' examples spell these JOB_STATE_*; the live API answers
    // BATCH_STATE_* (seen 2026-08-23). Matching the suffix serves both.
    if (state.endsWith("_SUCCEEDED")) return body;
    if (["_FAILED", "_CANCELLED", "_EXPIRED"].some((suffix) => state.endsWith(suffix))) {
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

  // First pass: decide what to draw, without generating anything.
  const due: Due[] = [];
  const drawn: string[] = [];
  const stale = new Set(
    changedSinceDrawn(files.map((file) => file.replace(/\.md$/, ""))),
  );
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
    drawn.push(slug);
    // Gaps only, unless asked otherwise. Editing the prompt in this file
    // changes every recipe's fingerprint at once, so a rule that redrew
    // whatever no longer matches would redraw the whole book on the strength
    // of one improved sentence. A picture that already exists is left alone
    // and, if its recipe has moved on, said out loud at the end instead.
    if (existsSync(out)) {
      if (args.force) {
        due.push({ slug, path, recipe, prompt, fingerprint, out });
        continue;
      }
      if (args.changed && stale.has(slug)) {
        due.push({ slug, path, recipe, prompt, fingerprint, out });
        continue;
      }
      skipped += 1;
      continue;
    }
    due.push({ slug, path, recipe, prompt, fingerprint, out });
  }

  // Reported whatever the run does, including a dry run and a run with nothing
  // to draw: the point of the list is that somebody sees it.
  if (stale.size > 0) {
    const drawnAndStale = drawn.filter((slug) => stale.has(slug));
    if (drawnAndStale.length > 0) {
      console.log(
        `${drawnAndStale.length} recipe${drawnAndStale.length === 1 ? " has" : "s have"} ` +
          `changed since ${drawnAndStale.length === 1 ? "its" : "their"} picture was drawn:`,
      );
      for (const slug of drawnAndStale) console.log(`  ${slug}`);
      console.log(
        args.changed || args.force
          ? ""
          : `Not redrawn. \`npm run photos -- --changed\` would, at about ` +
              `$${((PRICE_PER_IMAGE[MODEL] ?? 0) * drawnAndStale.length).toFixed(2)}.\n`,
      );
    }
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
      `${MODEL}: ${due.length} to draw of ${files.length} recipes, about ` +
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

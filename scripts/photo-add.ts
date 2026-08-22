/**
 * Putting a real photograph on a recipe.
 *
 * The key-free half of `photos.ts`, and the better half. A picture of the dish
 * you actually cooked is evidence; a generated one is decoration that matches
 * the words. Where both exist this wins, and running this over a recipe that
 * has a generated photo replaces it and drops the generated credit with it.
 *
 * Takes any image the phone or camera produced — JPEG, PNG, HEIC, whatever
 * sharp reads — crops it to the shape the page wants and writes it next to the
 * generated ones. No API, no key, no network.
 *
 * Usage:
 *   npm run photo:add -- mango-pudding ~/Pictures/IMG_4823.jpg
 *   npm run photo:add -- mango-pudding photo.jpg --credit "Photo by Kyle"
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { parseRecipeFile, serialiseRecipeFile } from "../src/lib/content/format";

const RECIPES_DIR = join("content", "recipes");
const PHOTOS_DIR = join("public", "photos");

/** The same shape and quality photos.ts writes, so the two are interchangeable. */
const WIDTH = 1200;
const HEIGHT = 675;
const QUALITY = 78;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const slug = positional[0];
  const source = positional[1];
  const creditIndex = argv.indexOf("--credit");
  const credit = creditIndex === -1 ? null : (argv[creditIndex + 1] ?? null);

  if (!slug || !source) {
    console.error("Usage: npm run photo:add -- <slug> <image file> [--credit '...']");
    process.exit(1);
  }

  const path = join(RECIPES_DIR, `${slug}.md`);
  if (!existsSync(path)) {
    console.error(`No recipe at ${path}.`);
    process.exit(1);
  }
  if (!existsSync(source)) {
    console.error(`No image at ${source}.`);
    process.exit(1);
  }

  const parsed = parseRecipeFile(slug, readFileSync(path, "utf8"));
  if (!parsed.ok) {
    console.error(`${slug}: ${parsed.error}`);
    process.exit(1);
  }

  mkdirSync(PHOTOS_DIR, { recursive: true });
  const out = join(PHOTOS_DIR, `${slug}.webp`);
  // `rotate()` with no argument applies the EXIF orientation and then strips
  // it, which is the difference between a phone photo appearing upright and
  // appearing on its side in half the browsers that render it.
  await sharp(readFileSync(source))
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: QUALITY })
    .toFile(out);

  writeFileSync(
    path,
    serialiseRecipeFile({
      ...parsed.recipe,
      photo: `/photos/${slug}.webp`,
      // A real photograph gets whatever credit was asked for and nothing
      // invented. Crucially the prompt fingerprint is cleared, so the next
      // `npm run photos` does not decide this recipe is due a generated one.
      photoCredit: credit ? { siteName: credit, pageUrl: null } : null,
      photoPrompt: null,
    }),
  );

  const kb = Math.round(readFileSync(out).byteLength / 1024);
  console.log(`${slug}: ${out} (${kb} kB)`);
}

void main();

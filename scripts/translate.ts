/**
 * Translating the recipes, once, at authoring time.
 *
 * ## Why this is a script and not a request
 *
 * The obvious answer to "store English and translate on call" is to translate
 * in the browser when someone picks a language. It cannot be done here, for a
 * reason that is structural rather than fussy: **this site is a static export
 * with no server.** There is nothing to hold an API key. A key shipped to the
 * browser is a key published — the pages are world-readable on GitHub Pages —
 * and a key published is a key spent by strangers.
 *
 * So the call moves to the only place that can hold a secret: here, run by a
 * person or by CI, with the key in the environment. English stays the only
 * thing anyone writes. The translations are generated, committed, and served as
 * static files like everything else, which buys three things a runtime call
 * would not:
 *
 *   - **The site keeps working with no key at all**, which is the rule the rest
 *     of this application already follows.
 *   - **A translation is reviewable.** It lands in a diff. Someone who reads
 *     Russian can correct a step, and the correction survives, because a
 *     hand-edited file is not overwritten unless its English original changed.
 *   - **Nothing costs anything at read time**, and nothing can fail at read
 *     time — no latency, no rate limit, no outage between a cook and a recipe.
 *
 * ## Not re-translating what has not changed
 *
 * Every generated file records a `sourceHash` of the English content it was
 * made from. A run skips any translation whose hash still matches, so editing
 * one recipe re-translates one recipe, and a correction someone made by hand to
 * a Russian step is not silently thrown away on the next run. `--force`
 * overrides that when the prompt itself has improved.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npm run translate
 *   ANTHROPIC_API_KEY=... npm run translate -- --force --only banana-bread
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseRecipeFile, type RecipeFile } from "../src/lib/content/format";
import { LANGUAGES, type Language } from "../src/lib/i18n/strings";
import { parseIngredientLine } from "../src/lib/ingredient-parser";

const RECIPES_DIR = join("content", "recipes");
const MODEL = "claude-opus-5";

/** What a translated recipe must come back as. */
const translationSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  servingLabel: z.string().nullable(),
  cookLabel: z.string().nullable(),
  tags: z.array(z.string()),
  ingredientNames: z.array(z.string()),
  steps: z.array(z.string()),
  notes: z.string().nullable(),
  storage: z.string().nullable(),
});

type Translation = z.infer<typeof translationSchema>;

/**
 * The tool Claude must call.
 *
 * Declared once, here, and used both as the tool's `input_schema` and as the
 * validator for what comes back — so the shape is stated once and a response
 * that does not match is a caught error rather than a malformed file on disk.
 */
const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "The recipe's title, translated." },
    description: { type: ["string", "null"], description: "The one-line description." },
    servingLabel: {
      type: ["string", "null"],
      description: "What one serving is called: slice, portion, loaf.",
    },
    cookLabel: {
      type: ["string", "null"],
      description: "The verb for the cooking time: bake, chill, freeze, prove.",
    },
    tags: { type: "array", items: { type: "string" } },
    ingredientNames: {
      type: "array",
      items: { type: "string" },
      description:
        "The NAME of each ingredient only, with no quantity and no unit, in the same order as given.",
    },
    steps: { type: "array", items: { type: "string" } },
    notes: { type: ["string", "null"] },
    storage: { type: ["string", "null"] },
  },
  required: [
    "title",
    "description",
    "servingLabel",
    "cookLabel",
    "tags",
    "ingredientNames",
    "steps",
    "notes",
    "storage",
  ],
};

const SYSTEM = `You translate recipes for a personal cookbook. You are given the English recipe and must return the same recipe in the target language.

Rules, in order of importance:

1. A method step is an instruction someone follows standing at a stove. Translate for a cook, not for a reader: keep every number, temperature, time and pan size exactly as given, and keep the sensory cues ("until a skewer comes out with moist crumbs", "until it smells of toffee") as cues rather than paraphrasing them away.
2. Return ingredient NAMES only — no quantities, no units. "115 g unsalted butter" becomes the translation of "unsalted butter". Keep any preparation note that is part of the name ("roughly chopped", "black-skinned and soft"). Return exactly as many names as you were given, in the same order.
3. Use the culinary vocabulary a cook in that language actually uses, not a literal gloss. Where an ingredient has no equivalent, keep the recognisable name rather than inventing one.
4. Keep the register of the original: direct, unhedged, no softening.
5. Convert nothing. Metric stays metric; the application handles units itself.`;

export function contentToTranslate(recipe: RecipeFile): Translation {
  return {
    title: recipe.title,
    description: recipe.description,
    servingLabel: recipe.servingLabel,
    cookLabel: recipe.cookLabel,
    tags: recipe.tags,
    ingredientNames: recipe.ingredients.map((line) => {
      const parsed = parseIngredientLine(line);
      return parsed.prepNote ? `${parsed.name}, ${parsed.prepNote}` : parsed.name;
    }),
    steps: recipe.steps,
    notes: recipe.notes,
    storage: recipe.storage,
  };
}

/** Identifies the English content a translation was made from. */
export function sourceHash(content: Translation): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}

async function translateOne(
  client: Anthropic,
  content: Translation,
  language: Language,
  languageName: string,
): Promise<Translation> {
  // Streamed because a long recipe with a dozen steps and a storage section can
  // run past the non-streaming request timeout, and adaptive thinking makes
  // that likelier rather than less likely.
  const message = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      tools: [
        {
          name: "translated_recipe",
          description: `The recipe in ${languageName}.`,
          input_schema: TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "translated_recipe" },
      messages: [
        {
          role: "user",
          content: `Target language: ${languageName} (${language}).\n\nRecipe:\n${JSON.stringify(
            content,
            null,
            2,
          )}`,
        },
      ],
    })
    .finalMessage();

  const call = message.content.find((block) => block.type === "tool_use");
  if (!call || call.type !== "tool_use") {
    throw new Error(`no tool call returned for ${language}`);
  }

  const parsed = translationSchema.safeParse(call.input);
  if (!parsed.success) {
    throw new Error(`malformed translation for ${language}: ${parsed.error.message}`);
  }

  // The alignment rule, enforced rather than trusted. A translation one short
  // puts the wrong name against every quantity below the gap, and it would look
  // entirely plausible.
  if (parsed.data.ingredientNames.length !== content.ingredientNames.length) {
    throw new Error(
      `${language}: got ${parsed.data.ingredientNames.length} ingredient names for ${content.ingredientNames.length} ingredients`,
    );
  }

  return parsed.data;
}

/** A translation, as a file. Deliberately the same shape as a recipe. */
export function serialise(t: Translation, hash: string): string {
  const front = [
    "---",
    `title: ${JSON.stringify(t.title)}`,
    t.description ? `description: ${JSON.stringify(t.description)}` : null,
    t.servingLabel ? `servingLabel: ${JSON.stringify(t.servingLabel)}` : null,
    t.cookLabel ? `cookLabel: ${JSON.stringify(t.cookLabel)}` : null,
    t.tags.length > 0 ? `tags:\n${t.tags.map((x) => `  - ${JSON.stringify(x)}`).join("\n")}` : null,
    `sourceHash: ${hash}`,
    "---",
  ].filter((line): line is string => line !== null);

  const body = [
    "",
    "## Ingredients",
    "",
    ...t.ingredientNames.map((name) => `- ${name}`),
    "",
    "## Method",
    "",
    ...t.steps.map((step, index) => `${index + 1}. ${step}`),
  ];

  if (t.notes) body.push("", "## Notes", "", t.notes);
  if (t.storage) body.push("", "## Storage", "", t.storage);

  return `${front.join("\n")}\n${body.join("\n")}\n`;
}

/** The `sourceHash` recorded in an existing translation, if there is one. */
function existingHash(path: string): string | null {
  if (!existsSync(path)) return null;
  const match = /^sourceHash:\s*(\S+)\s*$/m.exec(readFileSync(path, "utf8"));
  return match?.[1] ?? null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    console.error(
      "ANTHROPIC_API_KEY is not set.\n" +
        "The site does not need it — every page is already built and committed.\n" +
        "It is needed only to generate a translation for a recipe that has changed.",
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: key });
  const targets = LANGUAGES.filter((l) => l.code !== "en");

  const files = readdirSync(RECIPES_DIR)
    .filter((name) => name.endsWith(".md"))
    // A translation is itself a .md in this directory; it is not a source.
    .filter((name) => !/\.[a-z]{2}(-[A-Za-z]+)?\.md$/.test(name))
    .filter((name) => (only ? name === `${only}.md` : true))
    .sort();

  let written = 0;
  let skipped = 0;

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const parsed = parseRecipeFile(slug, readFileSync(join(RECIPES_DIR, file), "utf8"));
    if (!parsed.ok) {
      console.error(`skipping ${file}: ${parsed.error}`);
      continue;
    }

    const content = contentToTranslate(parsed.recipe);
    const hash = sourceHash(content);

    for (const target of targets) {
      const path = join(RECIPES_DIR, `${slug}.${target.code}.md`);
      if (!force && existingHash(path) === hash) {
        skipped += 1;
        continue;
      }

      process.stdout.write(`${slug} → ${target.label} … `);
      const translation = await translateOne(client, content, target.code, target.label);
      writeFileSync(path, serialise(translation, hash));
      written += 1;
      console.log("written");
    }
  }

  console.log(`\n${written} written, ${skipped} already current.`);
}

// Only when run as a command. The helpers above are imported by
// scripts/seed-translations.ts, which must not trigger a paid API call by
// merely being loaded.
if (process.argv[1]?.endsWith("translate.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

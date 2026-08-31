import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  parseRecipeFile,
  parseTranslationFile,
  type RecipeFile,
} from "@/lib/content/format";
import { buildDiagram, validateDiagram } from "@/lib/content/diagram";
import { loadAttribution, type Attribution } from "@/lib/content/attribution";
import { parseIngredientLine } from "@/lib/ingredient-parser";
import { LANGUAGE_CODES } from "@/lib/i18n/strings";

/**
 * Reading the collection off disk, at build time.
 *
 * Every page of the site is generated from these files by `next build`, so this
 * module runs once per deploy and never in a browser. There is no database and
 * no request-time data access: a recipe page is a static HTML file.
 *
 * Failures are collected rather than thrown. One recipe with a typo in its
 * front matter must not take down the build for the other ninety-nine — it
 * should produce a warning naming the file, and a site missing one recipe.
 */

const CONTENT_DIR = "content";
const RECIPES_DIR = join(CONTENT_DIR, "recipes");

/**
 * The canonical ingredient library, checked into the repository.
 *
 * The same table the database held, as one file. It stays shared across recipes
 * for the reason it always was: resolving *unsalted butter* once makes every
 * recipe using it accurate, and a correction propagates everywhere. As a file
 * it is also reviewable — a wrong figure shows up in a diff.
 */
const ingredientSchema = z.object({
  name: z.string(),

  /*
   * Per 100 g, one field per row of `NUTRIENTS` in lib/nutrition/nutrients.ts.
   *
   * Written out rather than generated from that table, deliberately: building
   * the shape with `Object.fromEntries` would type every field as `unknown` and
   * lose `LibraryIngredient` as a real type, which is the one thing keeping a
   * typo in this file from becoming a silently missing nutrient. The four
   * energy-bearing fields are required; every other one is optional, and its
   * absence means *unknown* rather than zero.
   */
  kcal100g: z.number(),
  protein100g: z.number(),
  carbs100g: z.number(),
  fat100g: z.number(),
  fiber100g: z.number().nullish(),
  sugar100g: z.number().nullish(),
  satFat100g: z.number().nullish(),
  cholesterolMg100g: z.number().nullish(),
  sodiumMg100g: z.number().nullish(),
  potassiumMg100g: z.number().nullish(),
  calciumMg100g: z.number().nullish(),
  ironMg100g: z.number().nullish(),
  magnesiumMg100g: z.number().nullish(),
  zincMg100g: z.number().nullish(),
  vitaminAUg100g: z.number().nullish(),
  vitaminCMg100g: z.number().nullish(),
  vitaminDUg100g: z.number().nullish(),
  vitaminEMg100g: z.number().nullish(),
  vitaminB12Ug100g: z.number().nullish(),
  folateUg100g: z.number().nullish(),

  /**
   * Alcohol by volume, as a percentage, for the rows that carry any.
   *
   * Separate from the `alcohol` entry in `excludes`, and the two answer
   * different questions. The tag is *any at all*, which is the right answer for
   * a filter: somebody avoiding alcohol strictly wants to know that vanilla
   * extract is 35% ethanol, even in a cookie. This is *how much*, which is what
   * the "contains alcohol" label on a recipe needs, because half a teaspoon of
   * extract in twenty-four cookies and a bottle of wine in a jug are not the
   * same fact, and a label that fires on both says nothing about either.
   *
   * Nothing here knows what survives cooking. It does not need to: the
   * quantities that get boiled — a tablespoon of shaoxing in a wok — are small
   * enough to fall under the threshold on volume alone. See `contains.ts`.
   */
  abvPercent: z.number().nullish(),
  /**
   * Milligrams of caffeine per 100 g, for the rows that carry any.
   *
   * Same split as `abvPercent`: `excludes: ["caffeine"]` says there is some,
   * this says how much, and only the second can tell a mug of coffee from a
   * dusting of cocoa.
   */
  caffeineMg100g: z.number().nullish(),

  /** rho, g/ml. Null where the ingredient is never measured by volume. */
  densityGPerMl: z.number().nullish(),
  /** mu, grams per countable item. */
  gramsPerUnit: z.number().nullish(),

  /**
   * What one mu is *called*, singular — "clove", "head", "sheet", "stick".
   *
   * mu on its own answers a question nobody asked. It says a clove of garlic
   * weighs 3 g, which lets a count become a mass; what a cook standing at a
   * shelf wants is the other direction, and "20 g garlic" is not a number of
   * cloves until something names the unit. With this, a line measured by weight
   * can carry the count that buys it.
   *
   * Opt-in per row rather than derived from the name, deliberately. A rule that
   * singularises "bird's eye chillies" produces "1 bird's eye chillie", and a
   * wrong noun in brackets on every recipe is worse than no noun at all. A row
   * without one shows no count, which is the right answer for the ingredients
   * where counting is meaningless — dried shrimp are not bought by the shrimp.
   */
  unitName: z.string().nullish(),
  /**
   * The plural, where adding an -s is wrong: leaf/leaves, chilli/chillies.
   * Absent means the -s rule is correct.
   */
  unitNamePlural: z.string().nullish(),

  /**
   * For a liquid a cook reconstitutes rather than buys: what makes it.
   *
   * Dashi and stock are listed in millilitres because that is what a recipe
   * uses, and the library's figures are for the brewed liquid. But nobody in
   * this kitchen brews a litre of dashi from kombu on a Tuesday — they drop a
   * sachet in a pan of water. `perMl` is how far one of them goes, so a recipe
   * asking for 600 ml can say how many packets and how much water, and can keep
   * saying it correctly when the recipe is scaled.
   *
   * `note` carries what the arithmetic cannot: which brands disagree, and by
   * how much.
   */
  madeUp: z
    .object({
      unitName: z.string(),
      unitNamePlural: z.string().nullish(),
      /** Millilitres of finished liquid one unit makes. */
      perMl: z.number().positive(),
      note: z.string().nullish(),
    })
    .nullish(),

  /**
   * What this ingredient rules out, from `DIET_TAGS` in lib/content/diet.ts.
   *
   * Absent or empty means it rules nothing out, which is the answer for most of
   * this library — vegetables, spices, sugar, water. It is about the substance
   * and not about any diet: a row says `pork`, not `not-halal`, and the diets
   * are assembled from the tags in one place rather than restated on 166 rows.
   *
   * Where a tag depends on the brand — soy sauce brewed with wheat, a curry
   * roux that may or may not declare milk — the tag takes the common case and
   * the row's `sourceNote` says so. That is also why nothing here is an
   * allergen guarantee, and why the site says as much wherever it shows one.
   */
  excludes: z.array(z.string()).nullish(),

  usdaFdcId: z.string().nullish(),
  source: z.enum(["USDA", "CLAUDE", "MANUAL"]).default("USDA"),
  sourceNote: z.string().nullish(),

  /**
   * How to keep what the recipe did not use.
   *
   * A recipe says how to store the dish and says nothing about the three
   * quarters of the cabbage still on the counter, which is the part that
   * actually gets thrown away. This is that answer, and it lives on the
   * ingredient rather than in the recipe for the same reason its macros do:
   * ginger is in ten recipes, and ten copies of the same paragraph would be
   * ten paragraphs to keep in step with each other.
   *
   * Present only where the answer is worth having. Salt, sugar and flour do
   * not need one, and a row that says "store in a cool dry place" is worse
   * than a row that says nothing.
   */
  keeping: z.string().nullish(),
});

export type LibraryIngredient = z.infer<typeof ingredientSchema>;

const categorySchema = z.object({
  name: z.string(),
  slug: z.string(),
  glyph: z.string().default("*"),
});

export type Category = z.infer<typeof categorySchema>;

export interface LoadProblem {
  file: string;
  error: string;
}

export interface Collection {
  recipes: RecipeFile[];
  ingredients: LibraryIngredient[];
  categories: Category[];
  /**
   * Who added each recipe, keyed by slug, read from git.
   *
   * Not on `RecipeFile` because it is not in the file: the file is what someone
   * wrote, and this is what the repository knows about how it got here. Keeping
   * them apart is what stops the two from ever disagreeing — see
   * lib/content/attribution.ts. Empty for a recipe committed in a history this
   * build cannot see, and empty everywhere on a shallow clone.
   */
  attribution: Record<string, Attribution>;
  /** Files that could not be read. Rendered on the site rather than hidden. */
  problems: LoadProblem[];
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Loads everything.
 *
 * Sorted by title so the build output is deterministic: two builds of the same
 * commit must produce identical HTML, or every deploy shows spurious changes.
 */
export function loadCollection(): Collection {
  const problems: LoadProblem[] = [];
  const recipes: RecipeFile[] = [];

  if (existsSync(RECIPES_DIR)) {
    const files = readdirSync(RECIPES_DIR)
      .filter((name) => name.endsWith(".md"))
      // `banana-bread.ru.md` is a translation of a recipe, not a recipe. It is
      // picked up below, from the file it belongs to.
      .filter((name) => !/\.[a-z]{2}(-[A-Za-z]+)?\.md$/.test(name))
      .sort();

    for (const name of files) {
      const slug = name.replace(/\.md$/, "");
      const raw = readFileSync(join(RECIPES_DIR, name), "utf8");
      const parsed = parseRecipeFile(slug, raw);
      if (!parsed.ok) {
        problems.push({ file: join(RECIPES_DIR, name), error: parsed.error });
        continue;
      }

      // Sibling files, one per language: banana-bread.ru.md beside
      // banana-bread.md. A translation that does not line up with the recipe is
      // reported and dropped rather than attached — see parseTranslationFile.
      for (const code of LANGUAGE_CODES) {
        if (code === "en") continue;
        const path = join(RECIPES_DIR, `${slug}.${code}.md`);
        if (!existsSync(path)) continue;
        const translated = parseTranslationFile(
          readFileSync(path, "utf8"),
          parsed.recipe.ingredients.length,
        );
        if (translated.ok) parsed.recipe.translations[code] = translated.translation;
        else problems.push({ file: path, error: translated.error });
      }

      // A diagram that has forgotten an ingredient looks entirely reasonable,
      // which is exactly why it is checked here and reported on the site
      // rather than left to be noticed.
      const names = parsed.recipe.ingredients.map(
        (line) => parseIngredientLine(line).name,
      );
      const diagram = buildDiagram(parsed.recipe.diagram, names);
      if (diagram) {
        for (const problem of validateDiagram(diagram, names)) {
          problems.push({ file: join(RECIPES_DIR, name), error: problem });
        }
      }

      recipes.push(parsed.recipe);
    }
  }

  const ingredientsRaw = readJson(join(CONTENT_DIR, "ingredients.json"));
  const ingredients: LibraryIngredient[] = [];
  if (Array.isArray(ingredientsRaw)) {
    for (const [index, entry] of ingredientsRaw.entries()) {
      const parsed = ingredientSchema.safeParse(entry);
      if (parsed.success) ingredients.push(parsed.data);
      else {
        problems.push({
          file: `content/ingredients.json [${index}]`,
          error: parsed.error.issues[0]?.message ?? "not in the expected shape",
        });
      }
    }
  }

  const categoriesRaw = readJson(join(CONTENT_DIR, "categories.json"));
  const categories: Category[] = Array.isArray(categoriesRaw)
    ? categoriesRaw.flatMap((entry) => {
        const parsed = categorySchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
    : [];

  recipes.sort((a, b) => a.title.localeCompare(b.title));

  return { recipes, ingredients, categories, attribution: loadAttribution(), problems };
}

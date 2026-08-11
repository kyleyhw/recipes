import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseRecipeFile, type RecipeFile } from "@/lib/content/format";

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
  kcal100g: z.number(),
  protein100g: z.number(),
  carbs100g: z.number(),
  fat100g: z.number(),
  fiber100g: z.number().nullish(),
  sugar100g: z.number().nullish(),
  sodiumMg100g: z.number().nullish(),
  /** rho, g/ml. Null where the ingredient is never measured by volume. */
  densityGPerMl: z.number().nullish(),
  /** mu, grams per countable item. */
  gramsPerUnit: z.number().nullish(),
  usdaFdcId: z.string().nullish(),
  source: z.enum(["USDA", "CLAUDE", "MANUAL"]).default("USDA"),
  sourceNote: z.string().nullish(),
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
      .sort();

    for (const name of files) {
      const slug = name.replace(/\.md$/, "");
      const raw = readFileSync(join(RECIPES_DIR, name), "utf8");
      const parsed = parseRecipeFile(slug, raw);
      if (parsed.ok) recipes.push(parsed.recipe);
      else problems.push({ file: join(RECIPES_DIR, name), error: parsed.error });
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

  return { recipes, ingredients, categories, problems };
}

/**
 * Checking a recipe before anyone else has to.
 *
 * `npm run check` already catches everything this does, by way of the test
 * suite — and reports it as a failed assertion in a wall of vitest output,
 * which is a fine thing for someone changing the parser and a hostile one for
 * someone who has added a single Markdown file and wants to know what is wrong
 * with it.
 *
 * So this says it in sentences instead, with the file and the line, and with a
 * suggestion where there is an honest one to make. It is the same content, read
 * out of the same directory; only the audience is different.
 *
 *     npm run validate                          # everything
 *     npm run validate -- content/recipes/x.md  # one file
 *     npm run validate -- --github              # annotations, for CI
 *     npm run validate -- --write               # rewrite files into canonical form
 *
 * `--github` emits GitHub's `::error file=…,line=…::` workflow commands, which
 * puts each problem on the line that caused it in the pull request's diff. That
 * is the whole reason this script exists rather than a nicer test reporter: a
 * contributor working through the GitHub web interface has no checkout to run
 * anything in, and the diff is the only place they will see a message.
 *
 * Exit code is 1 if anything is wrong, so it can gate a workflow.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  parseRecipeFile,
  serialiseRecipeFile,
  type RecipeFile,
} from "../src/lib/content/format";
import { buildDiagram, validateDiagram } from "../src/lib/content/diagram";
import { loadCollection, type LibraryIngredient } from "../src/lib/content/library";
import { matchIngredient } from "../src/lib/content/prepare";
import { parseIngredientLine } from "../src/lib/ingredient-parser";
import { isDietTag } from "../src/lib/content/diet";
import { suggestNames } from "../src/lib/content/suggest";

const RECIPES_DIR = join("content", "recipes");

interface Problem {
  file: string;
  /** 1-indexed, where the problem can be pinned to a line. */
  line: number | null;
  message: string;
  /** One sentence on how to fix it. */
  fix: string | null;
}

/** The line a piece of text sits on, 1-indexed, or null if it is not there. */
function lineOf(raw: string, needle: string): number | null {
  const index = raw.indexOf(needle);
  if (index === -1) return null;
  return raw.slice(0, index).split("\n").length;
}

function checkRecipe(
  path: string,
  raw: string,
  library: readonly LibraryIngredient[],
  categories: readonly string[],
  write = false,
): Problem[] {
  const problems: Problem[] = [];
  const slug = basename(path).replace(/\.md$/, "");
  const at = (needle: string) => lineOf(raw, needle);

  const parsed = parseRecipeFile(slug, raw);
  if (!parsed.ok) {
    problems.push({
      file: path,
      line: 1,
      message: `The front matter could not be read: ${parsed.error}`,
      fix: "Every recipe opens with a --- block containing at least title, category and servings.",
    });
    return problems;
  }
  const recipe: RecipeFile = parsed.recipe;

  // A file that does not re-serialise to itself gets rewritten the first time
  // any script touches it — `npm run photos` stamps a photo into the front
  // matter — which turns one recipe's change into a diff across the whole
  // collection. The usual cause is a front-matter line long enough for the YAML
  // writer to wrap it, and it is invisible until it happens.
  const canonical = serialiseRecipeFile(recipe);
  if (canonical !== raw) {
    if (write) {
      writeFileSync(path, canonical);
      console.log(`Rewrote ${path} in the canonical form.`);
    } else
      problems.push({
        file: path,
        line: 1,
        message:
          "This file is not in the collection's canonical form, so the next script to touch it will rewrite it.",
        fix: "Run `npm run validate -- --write` to rewrite it in place, then commit the result.",
      });
  }

  if (recipe.category && !categories.includes(recipe.category)) {
    problems.push({
      file: path,
      line: at(`category: ${recipe.category}`),
      message: `The category "${recipe.category}" is not one the collection has, so this recipe would appear on no shelf.`,
      fix: `Use one of: ${categories.join(", ")}.`,
    });
  }

  if (recipe.ingredients.length === 0) {
    problems.push({
      file: path,
      line: at("## Ingredients"),
      message: "There are no ingredients.",
      fix: "Add a `## Ingredients` section with one `- ` line per ingredient.",
    });
  }
  if (recipe.steps.length === 0) {
    problems.push({
      file: path,
      line: at("## Method"),
      message: "There is no method.",
      fix: "Add a `## Method` section with numbered steps.",
    });
  }
  if (!recipe.storage) {
    problems.push({
      file: path,
      line: null,
      message: "There is no Storage section.",
      fix: "Say how long it keeps, in what, and how to bring it back. Where a dish must be eaten at once, say that instead — it is the same question answered.",
    });
  }

  const names = library.map((entry) => entry.name);
  for (const line of recipe.ingredients) {
    const parsedLine = parseIngredientLine(line);
    if (matchIngredient(parsedLine.name, library)) continue;

    const guesses = suggestNames(parsedLine.name, names);
    problems.push({
      file: path,
      line: at(`- ${line}`),
      message: `Nothing in the ingredient library matches "${parsedLine.name}", so it will be missing from the nutrition panel.`,
      fix:
        guesses.length > 0
          ? `Did you mean ${guesses.map((g) => `"${g}"`).join(", ")}? If not, add a row for it to content/ingredients.json.`
          : "Add a row for it to content/ingredients.json. Buyability is the test, not whether the library already has it.",
    });
  }

  if (recipe.diagram.length === 0) {
    problems.push({
      file: path,
      line: null,
      message: "There is no diagram.",
      fix: "Add a `## Diagram` section — the method as an indented tree. docs/diagram.md has the grammar.",
    });
  } else {
    const ingredientNames = recipe.ingredients.map(
      (line) => parseIngredientLine(line).name,
    );
    const diagram = buildDiagram(recipe.diagram, ingredientNames);
    if (!diagram) {
      problems.push({
        file: path,
        line: at("## Diagram"),
        message: "The diagram could not be read as a tree.",
        fix: "Each line starts with `- ` and is indented two spaces per level, with exactly one line at the top.",
      });
    } else {
      for (const problem of validateDiagram(diagram, ingredientNames)) {
        problems.push({
          file: path,
          line: at("## Diagram"),
          message: `Diagram: ${problem}.`,
          fix: problem.startsWith("shares of")
            ? "Every share of one ingredient must add up to the whole of it: 1/3 and 2/3, not 1/3 and 1/3."
            : "Every ingredient has to appear somewhere in the diagram, even if only as a mention in a split.",
        });
      }
    }
  }

  return problems;
}

function checkIngredient(entry: LibraryIngredient, raw: string): Problem[] {
  const problems: Problem[] = [];
  const path = join("content", "ingredients.json");
  const line = lineOf(raw, `"name": ${JSON.stringify(entry.name)}`);
  const push = (message: string, fix: string) =>
    problems.push({ file: path, line, message, fix });

  if (!entry.sourceNote && !entry.usdaFdcId) {
    push(
      `The row for "${entry.name}" says nothing about where its figures came from.`,
      "Add a sourceNote, or a usdaFdcId. Every figure is a magic number and has to be traceable — and if it is a guess, say that it is a guess.",
    );
  }

  if (entry.keeping && entry.keeping.trim().length < 40) {
    push(
      `The keeping note on "${entry.name}" is a stub.`,
      "A place, a time, and the trick that extends it — or leave it out. A note that says 'store in a cool dry place' is worse than no note.",
    );
  }

  for (const tag of entry.excludes ?? []) {
    if (!isDietTag(tag)) {
      push(
        `"${entry.name}" is tagged \`${tag}\`, which is not a dietary tag the site knows.`,
        "The tags are listed in src/lib/content/diet.ts. An unknown one is ignored, so the ingredient silently rules nothing out.",
      );
    }
  }
  if (
    (entry.excludes ?? []).includes("pork") &&
    !(entry.excludes ?? []).includes("meat")
  ) {
    push(
      `"${entry.name}" is tagged \`pork\` but not \`meat\`, so it would pass a vegetarian filter.`,
      "Anything porcine carries both tags.",
    );
  }

  if (entry.unitName && !entry.gramsPerUnit) {
    push(
      `"${entry.name}" names a unit (\`${entry.unitName}\`) but has no gramsPerUnit, so no count can be worked out and none is shown.`,
      "Add gramsPerUnit — the mass of one of them — or drop unitName.",
    );
  }
  if (entry.unitNamePlural && !entry.unitName) {
    push(
      `"${entry.name}" has a plural unit name with no singular.`,
      "unitNamePlural only overrides unitName; it cannot stand alone.",
    );
  }
  if (entry.madeUp && !entry.densityGPerMl) {
    push(
      `"${entry.name}" is made up from a packet but has no densityGPerMl, so its volume resolves to nothing and the packet note never appears.`,
      "A reconstituted liquid needs a density — 1.0 g/ml is right for anything mostly water.",
    );
  }

  for (const [field, value] of [
    ["kcal100g", entry.kcal100g],
    ["protein100g", entry.protein100g],
    ["carbs100g", entry.carbs100g],
    ["fat100g", entry.fat100g],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      push(
        `"${entry.name}" has a ${field} of ${String(value)}.`,
        "The four energy-bearing figures are per 100 g and must be real numbers, zero or more.",
      );
    }
  }

  return problems;
}

function main(): void {
  const args = process.argv.slice(2);
  const asGithub = args.includes("--github");
  const write = args.includes("--write");
  const targets = args.filter((arg) => !arg.startsWith("--"));

  const collection = loadCollection();
  const categories = collection.categories.map((category) => category.name);
  const ingredientsRaw = existsSync(join("content", "ingredients.json"))
    ? readFileSync(join("content", "ingredients.json"), "utf8")
    : "";

  const files =
    targets.length > 0
      ? targets
      : existsSync(RECIPES_DIR)
        ? readdirSync(RECIPES_DIR)
            .filter((name) => name.endsWith(".md") && name.split(".").length === 2)
            .sort()
            .map((name) => join(RECIPES_DIR, name))
        : [];

  const problems: Problem[] = [];

  for (const file of files) {
    if (!existsSync(file)) {
      problems.push({
        file,
        line: null,
        message: "No such file.",
        fix: "A recipe lives at content/recipes/<slug>.md, all lower case with hyphens.",
      });
      continue;
    }
    problems.push(
      ...checkRecipe(
        file,
        readFileSync(file, "utf8"),
        collection.ingredients,
        categories,
        write,
      ),
    );
  }

  // The library is checked whole whatever was asked for: a row is shared, so a
  // problem in one is a problem for every recipe using it.
  if (targets.length === 0) {
    for (const entry of collection.ingredients) {
      problems.push(...checkIngredient(entry, ingredientsRaw));
    }
    // Anything the loader itself refused, which is mostly unreadable JSON.
    for (const problem of collection.problems) {
      problems.push({
        file: problem.file,
        line: null,
        message: problem.error,
        fix: null,
      });
    }
  }

  if (problems.length === 0) {
    const what =
      targets.length > 0
        ? `${files.length} file(s)`
        : `${files.length} recipes and ${collection.ingredients.length} ingredients`;
    console.log(`Nothing wrong with ${what}.`);
    return;
  }

  if (asGithub) {
    for (const problem of problems) {
      const where = `file=${problem.file}${problem.line === null ? "" : `,line=${problem.line}`}`;
      const text = problem.fix ? `${problem.message} ${problem.fix}` : problem.message;
      // Newlines terminate a workflow command, so they are escaped rather than
      // printed — otherwise a two-line message becomes one annotation and one
      // stray line of log.
      console.log(`::error ${where}::${text.replace(/\n/g, "%0A")}`);
    }
  }

  let current = "";
  for (const problem of problems) {
    if (problem.file !== current) {
      current = problem.file;
      console.log(`\n${current}`);
    }
    const where = problem.line === null ? "" : `:${problem.line}`;
    console.log(`  ${where ? `line ${problem.line}` : "—"}  ${problem.message}`);
    if (problem.fix) console.log(`          ${problem.fix}`);
  }

  console.log(
    `\n${problems.length} problem${problems.length === 1 ? "" : "s"}. ` +
      `Everything else about the recipe — whether the diagram is right, whether the ` +
      `steps are unambiguous, whether it is seasoned enough — is still yours to check.`,
  );
  process.exit(1);
}

main();

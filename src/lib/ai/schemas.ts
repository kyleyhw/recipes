import { z } from "zod";

/**
 * The schemas Claude's answers must satisfy, and the JSON Schema derived from
 * them for the tool definitions.
 *
 * Everything the model returns enters the application through one of these.
 * Each schema is written once and serves three purposes: it generates the tool
 * definition sent to the API, it validates the response that comes back, and
 * the TypeScript type is inferred from it rather than declared alongside it —
 * so the contract cannot drift out of agreement with itself.
 *
 * This module is pure. No `server-only`, no database, no client: the schemas
 * and the JSON Schema transform are directly testable.
 *
 * **Why free-text ingredient lines.** The recipe schemas ask for ingredients as
 * lines of text ("200 g red lentils"), not as pre-split quantity/unit/name
 * triples. The application already has one parser for that split
 * (`lib/ingredient-parser.ts`), it is the path every hand-typed and imported
 * recipe takes, and its output is what the nutrition pipeline is calibrated
 * against. Asking the model to split as well would create a second, invisible
 * parser whose disagreements with the first would surface as unexplained
 * differences in macros between a typed recipe and a generated one.
 */

// ---------------------------------------------------------------------------
// JSON Schema for tool definitions
// ---------------------------------------------------------------------------

/** A JSON Schema node, as far as this transform needs to understand one. */
type SchemaNode = Record<string, unknown>;

/**
 * Recursively enforces the constraints the strict tool-use subset requires:
 * every object closed to unknown properties, and every property required.
 *
 * `z.toJSONSchema` emits neither. It omits `additionalProperties` entirely and
 * lists only non-optional keys in `required`, which is correct JSON Schema and
 * insufficient here.
 *
 * The transform is applied rather than the constraints merely being asserted,
 * so that adding a `.optional()` to a schema later cannot silently produce a
 * definition the API rejects. Nullability is expressed with `.nullable()`,
 * which becomes an `anyOf` including `"null"` — supported, and honest about the
 * difference between "absent" and "not applicable".
 */
function makeStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(makeStrict);
  if (typeof node !== "object" || node === null) return node;

  const source = node as SchemaNode;
  const result: SchemaNode = {};

  for (const [key, value] of Object.entries(source)) {
    // The dialect declaration is meaningful to a JSON Schema validator and
    // meaningless to the API, which knows which dialect it accepts.
    if (key === "$schema") continue;
    result[key] = makeStrict(value);
  }

  if (result["type"] === "object") {
    result["additionalProperties"] = false;
    const properties = result["properties"];
    if (properties && typeof properties === "object") {
      result["required"] = Object.keys(properties as SchemaNode);
    }
  }

  return result;
}

/**
 * Derives a tool's `input_schema` from a zod schema.
 *
 * `io: "input"` because the model is producing the value that this schema will
 * then parse — it stands on the input side of the parse, not the output side.
 * The distinction is invisible for the schemas here (none carry transforms or
 * defaults) but stating it keeps the derivation correct if one ever does.
 */
export function toolInputSchema(schema: z.ZodType): SchemaNode {
  return makeStrict(z.toJSONSchema(schema, { io: "input" })) as SchemaNode;
}

// ---------------------------------------------------------------------------
// Recipes: generation and extraction
// ---------------------------------------------------------------------------

/**
 * A complete recipe, as generated from a request or extracted from prose.
 *
 * One schema serves both because the result is the same object in both cases —
 * a recipe this instance can save — and a second near-identical schema would be
 * two things to keep in agreement.
 */
export const recipeDraftSchema = z.object({
  title: z
    .string()
    .describe("Short dish name. No adjectives that are not part of the dish."),
  description: z
    .string()
    .nullable()
    .describe("One or two sentences on what this is and what it tastes like."),
  categoryName: z
    .string()
    .describe(
      "The single best category for this dish, chosen from the list of existing categories given in the prompt. Use an existing name exactly; only invent one if none of them fit at all.",
    ),
  tagNames: z
    .array(z.string())
    .describe(
      "Zero to four short lowercase labels that cut across categories: 'quick', 'vegan', 'freezes well'. Not the category, not the cuisine unless it is genuinely useful for finding the recipe again.",
    ),
  baseServings: z
    .number()
    .describe("How many servings the quantities below make. Must be greater than zero."),
  servingLabel: z
    .string()
    .describe("What one serving is called: 'serving', 'cookie', 'slice', 'loaf'."),
  prepMinutes: z
    .number()
    .nullable()
    .describe("Hands-on minutes, or null if not meaningful."),
  cookMinutes: z.number().nullable().describe("Unattended cooking minutes, or null."),
  ingredients: z
    .array(z.string())
    .describe(
      "One ingredient per line, written the way a recipe writes them: quantity, unit, name, then any preparation after a comma — '200 g red lentils', '2 tbsp ghee', '1 large onion, finely diced'. Prefer metric mass for solids. Write 'to taste' or 'for frying' where a quantity genuinely is not fixed.",
    ),
  steps: z
    .array(z.string())
    .describe(
      "The method, one step per entry. Each step is a direct instruction: what to do, to what, for how long, and how to tell when it is done. No step may leave the cook guessing at a quantity, a temperature, or a doneness cue.",
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      "Anything that does not belong in a step: storage, substitutions, warnings.",
    ),
  photoQuery: z
    .string()
    .describe(
      "A short image-search phrase that would find a photograph of this finished dish.",
    ),
});

export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

// ---------------------------------------------------------------------------
// Substitution
// ---------------------------------------------------------------------------

/**
 * A proposed substitution, expressed as a diff against the current recipe.
 *
 * `originalRawText` must reproduce an existing ingredient line verbatim, which
 * is what lets the application locate the line to replace instead of guessing.
 * A line that matches nothing is reported rather than applied, because applying
 * an unmatched edit silently would corrupt the recipe in a way the cook would
 * only discover mid-cook.
 */
export const substitutionSchema = z.object({
  feasible: z
    .boolean()
    .describe(
      "False when there is no substitution worth making — when the missing ingredient is what the dish is. Say so rather than proposing something that will not work.",
    ),
  summary: z
    .string()
    .describe(
      "One or two sentences: what changes, and what the dish will be like afterwards.",
    ),
  replacements: z.array(
    z.object({
      originalRawText: z
        .string()
        .describe(
          "The ingredient line being replaced, copied EXACTLY from the recipe given to you, character for character.",
        ),
      replacementRawText: z
        .string()
        .describe(
          "The new ingredient line, in the same format, with the substituted quantity already worked out.",
        ),
      ratio: z
        .string()
        .describe(
          "The substitution ratio stated explicitly, e.g. '1:1 by mass' or '3 parts replacement to 4 parts original by volume'.",
        ),
      effect: z
        .string()
        .describe("What this changes about flavour and texture. Be specific and honest."),
    }),
  ),
  stepEdits: z
    .array(
      z.object({
        originalText: z
          .string()
          .describe(
            "The step being changed, copied EXACTLY from the recipe given to you.",
          ),
        replacementText: z.string().describe("The rewritten step."),
        reason: z.string().describe("Why the method has to change."),
      }),
    )
    .describe(
      "Method changes the substitution forces. Empty when the method is unaffected — do not rewrite steps for the sake of it.",
    ),
});

export type Substitution = z.infer<typeof substitutionSchema>;

// ---------------------------------------------------------------------------
// Photo sourcing
// ---------------------------------------------------------------------------

/**
 * Candidate photographs found by web search.
 *
 * Several are requested rather than one because the application validates each
 * candidate before use — reachable, decodes, large enough, plausible aspect —
 * and a single candidate that fails validation would mean either a second
 * billable search or no photo at all. The runners-up are stored, so replacing a
 * photo later costs nothing.
 */
export const photoCandidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        imageUrl: z
          .string()
          .describe(
            "Direct URL of the image file itself, ending in .jpg/.jpeg/.png/.webp. NOT the URL of the page containing it.",
          ),
        pageUrl: z.string().describe("URL of the page the image appears on."),
        siteName: z
          .string()
          .describe("Human-readable name of the site, for attribution."),
        why: z
          .string()
          .describe(
            "One short line: why this is a photograph of this dish and not another.",
          ),
      }),
    )
    .describe(
      "Between one and four candidates, best first. Every one must be a photograph of the finished dish. Reject illustrations, collages, images with text overlaid, and photographs of ingredients rather than the cooked dish.",
    ),
});

export type PhotoCandidates = z.infer<typeof photoCandidatesSchema>;

// ---------------------------------------------------------------------------
// USDA matching
// ---------------------------------------------------------------------------

/**
 * A choice among USDA candidates, plus the two conversion factors USDA does not
 * supply.
 *
 * The candidates come from a deterministic search; the model's job is only to
 * choose between them and to supply rho and mu, which are properties of the
 * substance that FoodData Central does not record. `choiceIndex = -1` is the
 * honest answer when none of the candidates is the ingredient, and is preferred
 * to a wrong match: an unresolved ingredient is reported as a coverage gap,
 * whereas a wrong one silently poisons every macro figure that depends on it.
 */
export const foodChoiceSchema = z.object({
  choiceIndex: z
    .number()
    .describe(
      "Zero-based index of the best candidate, or -1 if none of them is this ingredient.",
    ),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().describe("One short line justifying the choice."),
  densityGPerMl: z
    .number()
    .nullable()
    .describe(
      "Grams per millilitre for this ingredient as it would be measured in a kitchen (flour spooned and levelled, not packed). Null if the ingredient is never measured by volume or you are not confident.",
    ),
  gramsPerUnit: z
    .number()
    .nullable()
    .describe(
      "Grams in one countable item, for ingredients counted rather than weighed: one egg, one clove of garlic, one medium onion. Null otherwise.",
    ),
});

export type FoodChoice = z.infer<typeof foodChoiceSchema>;

/**
 * A macro estimate for an ingredient FoodData Central has no record of, or that
 * cannot be looked up because no USDA key is configured.
 *
 * Stored with `source: CLAUDE`, which is what the provenance badge on the
 * ingredient row displays. The distinction from a USDA figure is preserved
 * everywhere rather than averaged away, because an estimate and a measurement
 * are not the same kind of number and the owner is entitled to know which one
 * is behind a macro total.
 */
export const foodEstimateSchema = z.object({
  isFood: z
    .boolean()
    .describe(
      "False if this is not an edible ingredient — a piece of equipment, a preparation instruction that was mis-parsed as an ingredient, or something you cannot identify. Say so rather than estimating.",
    ),
  kcal100g: z.number().describe("Energy in kilocalories per 100 g, as purchased."),
  protein100g: z.number().describe("Grams of protein per 100 g."),
  carbs100g: z.number().describe("Grams of total carbohydrate per 100 g."),
  fat100g: z.number().describe("Grams of total fat per 100 g."),
  fiber100g: z.number().nullable(),
  sugar100g: z.number().nullable(),
  sodiumMg100g: z.number().nullable().describe("Milligrams of sodium per 100 g."),
  densityGPerMl: z
    .number()
    .nullable()
    .describe(
      "Grams per millilitre as measured in a kitchen. Null if never measured by volume.",
    ),
  gramsPerUnit: z
    .number()
    .nullable()
    .describe("Grams in one countable item. Null if not counted."),
  basis: z
    .string()
    .describe(
      "One line naming what this estimate is based on — a comparable food, a published composition, a standard formulation. This is recorded verbatim against the ingredient so the figure can be traced.",
    ),
});

export type FoodEstimate = z.infer<typeof foodEstimateSchema>;

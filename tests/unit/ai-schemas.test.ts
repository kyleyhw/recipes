import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  foodChoiceSchema,
  foodEstimateSchema,
  photoCandidatesSchema,
  recipeDraftSchema,
  substitutionSchema,
  toolInputSchema,
} from "@/lib/ai/schemas";

/**
 * Tests for the contract between this application and the model.
 *
 * Two distinct things are checked, and they fail in different ways:
 *
 *  - **The generated JSON Schema.** A schema missing `additionalProperties` or
 *    an incomplete `required` is rejected by the API at request time, so every
 *    AI feature fails at once, with an error about a tool definition rather
 *    than about anything a user did. These are structural assertions over the
 *    generated document, not over any particular field.
 *  - **The validation.** A malformed answer must be caught rather than written
 *    into the database, since these values become recipes, macros, and image
 *    fetches.
 */

/** Every object node in a JSON Schema document, including nested ones. */
function objectNodes(node: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(node)) return node.flatMap(objectNodes);
  if (typeof node !== "object" || node === null) return [];
  const record = node as Record<string, unknown>;
  const here = record["type"] === "object" ? [record] : [];
  return [...here, ...Object.values(record).flatMap(objectNodes)];
}

const ALL_SCHEMAS = {
  recipeDraft: recipeDraftSchema,
  substitution: substitutionSchema,
  photoCandidates: photoCandidatesSchema,
  foodChoice: foodChoiceSchema,
  foodEstimate: foodEstimateSchema,
};

describe("generated tool schemas", () => {
  it.each(Object.entries(ALL_SCHEMAS))(
    "closes every object in %s to unknown properties",
    (_name, schema) => {
      const generated = toolInputSchema(schema);
      const nodes = objectNodes(generated);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node["additionalProperties"]).toBe(false);
      }
    },
  );

  it.each(Object.entries(ALL_SCHEMAS))(
    "requires every property in %s",
    (_name, schema) => {
      for (const node of objectNodes(toolInputSchema(schema))) {
        const properties = Object.keys((node["properties"] ?? {}) as object);
        expect(node["required"]).toEqual(properties);
      }
    },
  );

  /**
   * The dialect declaration is meaningful to a JSON Schema validator and
   * meaningless here. It is stripped because unrecognised keywords are not
   * silently ignored — they are folded into the field's description, where a
   * URL would end up as instructions to the model.
   */
  it("strips the $schema declaration", () => {
    expect(JSON.stringify(toolInputSchema(recipeDraftSchema))).not.toContain("$schema");
  });

  /**
   * The transform must be a transform, not an assertion about the schemas that
   * happen to exist today: a `.optional()` added later must still produce a
   * definition the API accepts.
   */
  it("requires a property that zod marked optional", () => {
    const generated = toolInputSchema(
      z.object({ a: z.string(), b: z.string().optional() }),
    );
    expect(generated["required"]).toEqual(["a", "b"]);
  });

  /** Nullability survives as an anyOf, which is how "not applicable" is said. */
  it("keeps nullable fields nullable", () => {
    const generated = toolInputSchema(z.object({ a: z.number().nullable() }));
    const properties = generated["properties"] as Record<string, Record<string, unknown>>;
    expect(JSON.stringify(properties["a"])).toContain("null");
  });

  /**
   * The field descriptions are the instructions the model actually reads. A
   * schema that generated without them would still validate and would quietly
   * produce worse recipes.
   */
  it("carries the field descriptions through to the tool definition", () => {
    const generated = JSON.stringify(toolInputSchema(recipeDraftSchema));
    expect(generated).toContain("One ingredient per line");
    expect(generated).toContain("doneness cue");
  });
});

describe("validating what comes back", () => {
  const validDraft = {
    title: "Dal Tarka",
    description: "Sharp and hot.",
    categoryName: "Mains",
    tagNames: ["quick"],
    baseServings: 4,
    servingLabel: "serving",
    prepMinutes: 10,
    cookMinutes: 30,
    ingredients: ["200 g red lentils"],
    steps: ["Simmer the lentils for 25 minutes, until they collapse when pressed."],
    notes: null,
    photoQuery: "dal tarka",
  };

  it("accepts a well-formed recipe", () => {
    expect(recipeDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("rejects a recipe missing its steps", () => {
    const { steps: _steps, ...missing } = validDraft;
    expect(recipeDraftSchema.safeParse(missing).success).toBe(false);
  });

  /**
   * Null and absent are different answers, and the distinction is load-bearing:
   * `prepMinutes: null` means the model considered it and found it meaningless,
   * which the schema permits, whereas a missing field means the answer is
   * incomplete.
   */
  it("accepts an explicit null where one is allowed, and refuses the field's absence", () => {
    expect(
      recipeDraftSchema.safeParse({ ...validDraft, prepMinutes: null }).success,
    ).toBe(true);
    const { prepMinutes: _prep, ...absent } = validDraft;
    expect(recipeDraftSchema.safeParse(absent).success).toBe(false);
  });

  it("rejects a string where a number is required", () => {
    // A model may render a quantity as text. Coercion here would put "4
    // servings" into a field the scaling factor divides by.
    expect(
      recipeDraftSchema.safeParse({ ...validDraft, baseServings: "four" }).success,
    ).toBe(false);
  });

  it("rejects a confidence outside the enumerated set", () => {
    expect(
      foodChoiceSchema.safeParse({
        choiceIndex: 0,
        confidence: "certain",
        reason: "",
        densityGPerMl: null,
        gramsPerUnit: null,
      }).success,
    ).toBe(false);
  });

  it("accepts a rejection of every USDA candidate", () => {
    // -1 is the honest answer, and must validate as readily as a match: an
    // unresolved ingredient is a reported gap, a wrong one is silent damage.
    const parsed = foodChoiceSchema.safeParse({
      choiceIndex: -1,
      confidence: "low",
      reason: "None of these is fresh curry leaf.",
      densityGPerMl: null,
      gramsPerUnit: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects photo candidates that are not objects of the expected shape", () => {
    expect(
      photoCandidatesSchema.safeParse({
        candidates: ["https://example.com/photo.jpg"],
      }).success,
    ).toBe(false);
  });
});

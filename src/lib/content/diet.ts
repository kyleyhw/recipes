/**
 * What a recipe contains, and therefore who cannot eat it.
 *
 * Derived, never declared. No recipe file carries a `vegetarian: true` field,
 * because a field like that is a claim somebody typed once and nobody checks
 * again — add oyster sauce to a stir-fry two months later and the field is
 * still there, still saying vegetarian, still wrong. Instead every ingredient
 * row says what it *excludes*, and a recipe's diets are worked out from its
 * ingredients every time the site is built. Change an ingredient list and the
 * answer changes with it, which is the only version of this that stays true.
 *
 * ## The thing this is not
 *
 * **It is not an allergen guarantee, and the site says so wherever it shows
 * one.** What it reads is the ingredient list in a Markdown file, not a label
 * on a jar. Three ways that falls short, all of them real:
 *
 *  - **Brands differ.** Chinese soy sauce is brewed with wheat and Japanese
 *    tamari usually is not; doubanjiang commonly carries wheat flour and some
 *    brands do not; a curry roux may or may not contain milk powder. The tags
 *    below take the common case and the ingredient's own `sourceNote` carries
 *    the doubt.
 *  - **Cross-contamination is invisible here.** A packet that says "may contain
 *    nuts" is a fact about a factory, and nothing in this repository knows it.
 *  - **A missing row is unknown, not clean.** An ingredient the library cannot
 *    resolve makes every claim about that recipe fail rather than pass — see
 *    `dietsFor`. Silence is not a clean bill of health.
 *
 * For a preference — no pork, no alcohol, eating vegetarian this month — that
 * is plenty. For a medical allergy it is a shortlist and the packet is the
 * authority.
 */

/**
 * What an ingredient can exclude.
 *
 * Deliberately about the *substance* and not about the diet: an ingredient does
 * not know what "vegan" means and should not have to. `pork` is separate from
 * `meat` rather than implied by it because the two are asked about
 * independently, and a row carries both where both are true.
 */
export const DIET_TAGS = [
  "meat",
  "pork",
  "fish",
  "shellfish",
  "dairy",
  "egg",
  "peanut",
  "nuts",
  "sesame",
  "soy",
  "gluten",
  "alcohol",
  "caffeine",
] as const;

export type DietTag = (typeof DIET_TAGS)[number];

export function isDietTag(value: string): value is DietTag {
  return (DIET_TAGS as readonly string[]).includes(value);
}

/** One of the filters the site offers. */
export interface Diet {
  key: DietKey;
  /** Everything a recipe must be free of to qualify. */
  excludes: readonly DietTag[];
}

export type DietKey =
  | "vegetarian"
  | "vegan"
  | "no-pork"
  | "no-fish"
  | "no-shellfish"
  | "no-dairy"
  | "no-egg"
  | "no-nuts"
  | "no-peanut"
  | "no-sesame"
  | "no-soy"
  | "no-gluten"
  | "no-alcohol"
  | "no-caffeine";

/**
 * The diets offered, in the order they are offered.
 *
 * The two whole ways of eating first, then the single exclusions roughly in the
 * order people ask about them. Vegetarian excludes gelatine and fish sauce as
 * well as the obvious things, which is the whole reason this is computed from a
 * tagged ingredient library rather than from a glance at the title: nothing in
 * "Kitsune Udon" says it is built on a fish stock.
 *
 * `no-peanut` and `no-nuts` are separate because peanuts are legumes and the
 * two allergies are not the same one. Selecting both is normal and is what most
 * people mean by "no nuts"; the menu offers each because the distinction
 * matters to whoever it matters to.
 */
export const DIETS: readonly Diet[] = [
  { key: "vegetarian", excludes: ["meat", "pork", "fish", "shellfish"] },
  { key: "vegan", excludes: ["meat", "pork", "fish", "shellfish", "dairy", "egg"] },
  { key: "no-pork", excludes: ["pork"] },
  { key: "no-fish", excludes: ["fish"] },
  { key: "no-shellfish", excludes: ["shellfish"] },
  { key: "no-dairy", excludes: ["dairy"] },
  { key: "no-egg", excludes: ["egg"] },
  { key: "no-peanut", excludes: ["peanut"] },
  { key: "no-nuts", excludes: ["nuts"] },
  { key: "no-sesame", excludes: ["sesame"] },
  { key: "no-soy", excludes: ["soy"] },
  { key: "no-gluten", excludes: ["gluten"] },
  { key: "no-alcohol", excludes: ["alcohol"] },
  { key: "no-caffeine", excludes: ["caffeine"] },
];

export const DIET_KEYS: readonly DietKey[] = DIETS.map((diet) => diet.key);

/**
 * The diets a recipe satisfies, given what its ingredients exclude.
 *
 * `unknown` is the argument that matters. It is true when any ingredient line
 * failed to resolve against the library, and it makes this return nothing at
 * all — not "vegan because we found no meat". The absence of evidence about an
 * ingredient is not evidence that the ingredient is fine, and a filter that
 * treats it as such would hide exactly the recipes it should be surfacing for
 * someone to check by hand.
 */
export function dietsFor(
  tags: Iterable<DietTag>,
  options: { unknown?: boolean } = {},
): DietKey[] {
  if (options.unknown) return [];
  const present = new Set(tags);
  return DIETS.filter((diet) => diet.excludes.every((tag) => !present.has(tag))).map(
    (diet) => diet.key,
  );
}

/**
 * The tags worth stating positively, rather than only as something to filter
 * out.
 *
 * Every other tag answers "can I eat this?", and the honest place for that
 * answer is the folded list of diets a recipe suits — a reader who avoids
 * shellfish knows to look. These two answer a different question, asked by
 * people who are not filtering at all: whether to give this to a child, whether
 * to drink it at ten at night, whether the driver can have one. That question is
 * only answered by something you see without looking for it, so these are shown
 * as a label on the recipe rather than as an entry in a list you have to open.
 *
 * They keep their `no-alcohol` and `no-caffeine` filters as well. The label and
 * the filter are the same fact read by two different people.
 */
export const CONTAINS_TAGS = ["alcohol", "caffeine"] as const;

export type ContainsTag = (typeof CONTAINS_TAGS)[number];

/**
 * What a recipe contains, of the two things worth saying out loud.
 *
 * **Deliberately not suppressed by `unknown`, which is the opposite of what
 * `dietsFor` does, and the asymmetry is the point.** A diet claim is a claim
 * about everything a recipe does *not* contain, so one unresolved ingredient
 * destroys it — the absence of evidence is not evidence of absence. This is a
 * claim about something that *is* there, resting on an ingredient that did
 * resolve, and an unrelated unresolved line does not make the wine in the pan
 * any less real.
 *
 * The failure the two rules guard against are mirror images. Suppressing a diet
 * on unknown evidence hides a recipe from someone who could have eaten it, and
 * that is a nuisance. Suppressing this on unknown evidence would serve someone
 * a glass of wine they were avoiding, and that is not.
 */
export function containsFor(tags: Iterable<DietTag>): ContainsTag[] {
  const present = new Set(tags);
  return CONTAINS_TAGS.filter((tag) => present.has(tag));
}

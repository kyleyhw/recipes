import { notFound } from "next/navigation";
import { RecipeView } from "@/components/recipe-view";
import { T, TCategory, TContent, TDuration } from "@/components/language";
import { SourceLine } from "@/components/source-line";
import { AttributionLine } from "@/components/attribution-line";
import { Prose } from "@/components/prose";
import { ExportLinks } from "@/components/export-links";
import { recipeFilename, type RecipeTranslation } from "@/lib/content/format";
import { loadCollection } from "@/lib/content/library";
import { buildDiagram } from "@/lib/content/diagram";
import { parseIngredientLine } from "@/lib/ingredient-parser";
import { keepingNotes, prepareRecipe } from "@/lib/content/prepare";
import { placeholderStyle } from "@/lib/photos/placeholder";
import { assetUrl, repoUrl } from "@/lib/site";
import { totalMinutes } from "@/lib/duration";

/**
 * One recipe.
 *
 * Prerendered at build time, one HTML file per recipe. The ingredients, the
 * method and the macro panel are handed to a client component so the serving
 * count can be changed without a server; everything else is static.
 *
 * The log and the history are no longer built by this application — they are
 * the file's own git history, and the links at the bottom go to it. That is the
 * whole point of the file format: the features that took two database tables
 * and a diff renderer to provide are now provided by the thing the recipe lives
 * in.
 */

export function generateStaticParams(): Array<{ slug: string }> {
  return loadCollection().recipes.map((recipe) => ({ slug: recipe.slug }));
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { recipes, ingredients, categories, attribution } = loadCollection();
  const recipe = recipes.find((entry) => entry.slug === slug);
  if (!recipe) notFound();
  const credit = attribution[slug] ?? null;

  const prepared = prepareRecipe(recipe, ingredients);
  const keeping = keepingNotes(recipe, ingredients);
  // Every recipe's name, in every language it has one in, so that a note naming
  // another recipe links to it — see lib/content/cross-links.ts. This recipe is
  // left out: a page that links to itself is a page that looks broken.
  const crossLinks = recipes
    .filter((entry) => entry.slug !== recipe.slug)
    .flatMap((entry) => [
      { title: entry.title, slug: entry.slug },
      ...Object.values(entry.translations).map((t) => ({
        title: t.title,
        slug: entry.slug,
      })),
    ]);
  const glyph = categories.find((c) => c.name === recipe.category)?.glyph ?? "*";
  const total = totalMinutes(recipe);
  const file = recipeFilename(recipe.slug);
  const repo = repoUrl();

  // One field at a time, so a half-finished translation degrades field by
  // field rather than all at once.
  const field = (pick: (t: RecipeTranslation) => string | null) =>
    Object.fromEntries(
      Object.entries(recipe.translations).map(([code, t]) => [code, pick(t)]),
    );
  const titles = field((t) => t.title);
  // Built here rather than in the browser: it depends only on the file, so it
  // is the same table on every load and costs the client nothing to derive.
  const diagram = buildDiagram(
    recipe.diagram,
    recipe.ingredients.map((line) => parseIngredientLine(line).name),
  );
  const cookLabels = field((t) => t.cookLabel);
  // Tags are a list, so they translate as a list: index by index, falling back
  // to the English tag where a translation has fewer.
  // Prep, cook and wait, then their sum — and the sum includes the wait, so a
  // recipe that needs a night in the fridge says so at the top rather than in
  // step 9. The total is dropped when there is only one part, since repeating
  // "20 min prep · 20 min total" tells nobody anything.
  const waitLabels = field((t) => t.waitLabel);
  const timeParts = [
    recipe.prepMinutes ? <TDuration k="minPrep" minutes={recipe.prepMinutes} /> : null,
    recipe.cookMinutes ? (
      <TDuration
        k="minCook"
        minutes={recipe.cookMinutes}
        label={recipe.cookLabel}
        labelTranslations={cookLabels}
      />
    ) : null,
    recipe.waitMinutes ? (
      <TDuration
        k="minCook"
        minutes={recipe.waitMinutes}
        label={recipe.waitLabel}
        labelTranslations={waitLabels}
      />
    ) : null,
  ].filter(Boolean);
  // Held apart from the parts rather than appended to them, because the two are
  // joined differently: the stretches add up, and the total is what they add up
  // to. See the note in components/recipe-card.tsx.
  const totalPart =
    timeParts.length > 1 && total !== null ? (
      <TDuration k="minTotal" minutes={total} />
    ) : null;

  const tagAt = (index: number) =>
    Object.fromEntries(
      Object.entries(recipe.translations).map(([code, t]) => [
        code,
        t.tags[index] ?? null,
      ]),
    );

  return (
    <article className="mx-auto max-w-2xl">
      <div className="relative mb-5 aspect-16/9 w-full overflow-hidden rounded-card">
        {recipe.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(recipe.photo) ?? undefined}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={placeholderStyle(recipe.slug)}
            aria-hidden="true"
          >
            <span className="text-7xl drop-shadow-sm">{glyph}</span>
          </div>
        )}
      </div>

      {/* A credit with no link is still a credit, and the case that matters:
          a generated picture has no page to point at, and saying nothing about
          where an image came from is the one thing this line exists to stop. */}
      {recipe.photoCredit?.pageUrl || recipe.photoCredit?.siteName ? (
        <p className="text-xs text-text-muted">
          <T k="photoBy" />:{" "}
          {recipe.photoCredit.pageUrl ? (
            <a
              href={recipe.photoCredit.pageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-text"
            >
              {recipe.photoCredit.siteName ?? "source"}
            </a>
          ) : (
            recipe.photoCredit.siteName
          )}
        </p>
      ) : null}

      <header className="mt-6">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
            <TCategory name={recipe.category} />
          </span>
          {recipe.draft ? (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
              <T k="draftBanner" />
            </span>
          ) : null}
        </div>

        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          <TContent en={recipe.title} translated={titles} />
        </h1>

        {recipe.description ? (
          <p className="mt-2 text-text-muted">
            <TContent en={recipe.description} translated={field((t) => t.description)} />
          </p>
        ) : null}

        {total !== null && total > 0 ? (
          <p className="numeric mt-3 text-sm text-text-muted">
            {timeParts.map((part, index) => (
              <span key={index}>
                {index > 0 ? " + " : null}
                {part}
              </span>
            ))}
            {totalPart ? <span> = {totalPart}</span> : null}
          </p>
        ) : null}

        {recipe.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {recipe.tags.map((tag, index) => (
              <li
                key={tag}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted"
              >
                <TContent en={tag} translated={tagAt(index)} />
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <RecipeView
        title={recipe.title}
        baseServings={recipe.servings}
        servingLabel={recipe.servingLabel}
        scalable={prepared.scalable}
        nutrition={prepared.nutrition}
        library={prepared.library}
        steps={recipe.steps}
        tin={recipe.tin}
        translations={recipe.translations}
        diagram={diagram}
      />

      <div className="mt-4">
        <ExportLinks slug={recipe.slug} />
      </div>

      {recipe.notes ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">
            <T k="notes" />
          </h2>
          <Prose
            en={recipe.notes}
            translated={field((t) => t.notes)}
            titles={crossLinks}
            className="text-sm text-text-muted"
          />
        </section>
      ) : null}

      {/* Storing the dish and storing what is left of its ingredients are the
          same question asked once, standing at the counter with half a cabbage
          in hand. So they are one section: the recipe's own prose first, then
          the perishables it used, whose notes come from the ingredient library
          and are shared by every recipe that uses them. */}
      {recipe.storage || keeping.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">
            <T k="storage" />
          </h2>
          {recipe.storage ? (
            <Prose
              en={recipe.storage}
              translated={field((t) => t.storage)}
              titles={crossLinks}
              className="text-sm text-text-muted"
            />
          ) : null}

          {keeping.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">
                <T k="keepingUnused" />
              </h3>
              <dl className="flex flex-col gap-1.5">
                {keeping.map((entry) => (
                  <div key={entry.name} className="text-sm">
                    <dt className="inline font-medium">{entry.name}</dt>{" "}
                    <dd className="inline text-text-muted">{entry.keeping}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      {recipe.log.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">
            <T k="log" />
          </h2>
          <ul className="flex flex-col gap-2">
            {recipe.log.map((entry, index) => (
              <li key={`${entry.date}-${index}`} className="text-sm">
                {entry.date ? (
                  <span className="numeric mr-2 text-xs text-text-muted">
                    {entry.date}
                  </span>
                ) : null}
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Provenance, at the bottom.
          Where a recipe came from and where the file lives are the same kind of
          fact — they answer "is this trustworthy?" rather than "how do I cook
          it?" — so they sit together, below the cooking, out of the way of it. */}
      {recipe.source || repo || credit ? (
        <section className="mt-10 flex flex-col gap-1 border-t border-border pt-4">
          <SourceLine sourceUrl={recipe.source} className="text-xs" />
          {credit ? (
            <AttributionLine
              attribution={credit}
              commitUrl={repo ? `${repo}/commit/${credit.addedCommit}` : null}
            />
          ) : null}
          {repo ? (
            <p className="text-xs text-text-muted">
              <T k="oneFile" />{" "}
              <a
                href={`${repo}/blob/main/${file}`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-text"
              >
                <T k="readIt" />
              </a>
              ,{" "}
              <a
                href={`${repo}/edit/main/${file}`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-text"
              >
                <T k="editIt" />
              </a>
              <T k="orSee" />{" "}
              <a
                href={`${repo}/commits/main/${file}`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-text"
              >
                <T k="history" />
              </a>
              .
            </p>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

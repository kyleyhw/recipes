import Link from "next/link";
import { repoUrl } from "@/lib/site";

/**
 * How this works, for anyone who lands on the site — including its owner in
 * six months.
 */
export default function AboutPage() {
  const repo = repoUrl();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">About</h1>

      <p className="mt-4 text-sm">
        A personal recipe collection. Each recipe is a single Markdown file in a git
        repository; this site is generated from those files and rebuilt whenever one
        changes. There is no database and no server.
      </p>

      <h2 className="mt-8 text-sm font-semibold tracking-wide uppercase">Scaling</h2>
      <p className="mt-2 text-sm">
        The stepper on a recipe multiplies every quantity and re-renders it as a
        measurement a kitchen can actually make — halves, thirds, quarters, sixths and
        eighths, never sevenths. Lines like <em>salt to taste</em> are left alone, because
        multiplying them produces confident nonsense. Leavening, salt in fermented doughs
        and bake times are flagged rather than scaled: they do not scale linearly, and
        pretending otherwise would be fabricated precision.
      </p>

      <h2 className="mt-8 text-sm font-semibold tracking-wide uppercase">Macros</h2>
      <p className="mt-2 text-sm">
        Computed from a{" "}
        <Link href="/ingredients" className="text-accent hover:underline">
          shared ingredient library
        </Link>
        , per serving, and invariant under scaling — doubling a recipe doubles the food
        and the servings, so a serving is unchanged. Where an ingredient is not in the
        library it is reported as a gap rather than counted as zero:{" "}
        <em>contains no fat</em> and <em>we do not know its fat content</em> are different
        claims.
      </p>
      <p className="mt-2 text-sm">
        Coverage is the fraction of the recipe <em>by mass</em> with known nutrition, not
        the fraction of ingredients. An unmatched pinch of salt and an unmatched 500 g of
        flour are not the same situation.
      </p>

      <h2 className="mt-8 text-sm font-semibold tracking-wide uppercase">
        Editing and history
      </h2>
      <p className="mt-2 text-sm">
        Every recipe links to its own file. Editing is a commit, its history is the
        file&rsquo;s history, and sharing one is sending the file or the link. The site is
        publicly readable; only the repository owner can change it.
      </p>

      {repo ? (
        <p className="mt-8 text-sm">
          <a
            href={repo}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent hover:underline"
          >
            The repository
          </a>{" "}
          — clone it and you have your own.
        </p>
      ) : null}
    </div>
  );
}

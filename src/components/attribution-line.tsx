"use client";

import { Fragment, type ReactNode } from "react";
import { useT } from "@/components/language";
import type { Attribution, Person } from "@/lib/content/attribution";

/**
 * Who put this recipe here.
 *
 * A collection anyone can send a recipe to needs to say whose recipe each one
 * is — partly as credit, and partly because it is the first thing you want to
 * know when a step reads oddly. The names come from the commits rather than
 * from anything typed into the file, so there is nothing to keep up to date and
 * nothing that can disagree with the history.
 *
 * The date links to the commit that added it. That is the substantive claim
 * this line makes: not "someone says this was added by X" but "here is the
 * change, go and look".
 */

/*
 * Placeholders as control characters.
 *
 * The sentence has to come out of the string table, because "Added by X on Y"
 * puts its parts in a different order in every language — Chinese leads with
 * the person, Russian leads with the verb. So the table renders the sentence
 * with two markers in it and this file splits on them and drops elements in.
 * Control characters cannot occur in a translation, which is what makes the
 * split safe.
 */
const WHO = "\u0000";
const DATE = "\u0001";

function fill(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text
    .split(/([\u0000\u0001])/)
    .map((chunk, index) => <Fragment key={index}>{parts[chunk] ?? chunk}</Fragment>);
}

/**
 * A name, linked to a profile where the commit gives one away.
 *
 * The name is what is shown even when a handle is known: it is what the person
 * chose to be called, and `@handle` in place of it reads as a mention rather
 * than as authorship.
 */
function PersonName({ person }: { person: Person }) {
  if (!person.handle) return <>{person.name}</>;
  return (
    <a
      href={`https://github.com/${person.handle}`}
      target="_blank"
      rel="noreferrer noopener"
      className="underline hover:text-text"
    >
      {person.name}
    </a>
  );
}

/** "A", "A and B", "A, B and C" — the last join is a word, not a comma. */
function Names({ people, and }: { people: readonly Person[]; and: string }) {
  return (
    <>
      {people.map((person, index) => (
        <Fragment key={person.handle ?? person.name}>
          {index > 0 ? (index === people.length - 1 ? ` ${and} ` : ", ") : null}
          <PersonName person={person} />
        </Fragment>
      ))}
    </>
  );
}

export function AttributionLine({
  attribution,
  commitUrl,
}: {
  attribution: Attribution;
  /** The commit that added the recipe. Null when the repository is unknown. */
  commitUrl: string | null;
}) {
  const t = useT();
  const and = t("listAnd");

  const date = commitUrl ? (
    <a
      href={commitUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="numeric underline hover:text-text"
    >
      {attribution.addedOn}
    </a>
  ) : (
    <span className="numeric">{attribution.addedOn}</span>
  );

  return (
    <p className="text-xs text-text-muted">
      {fill(t("addedBy", { who: WHO, date: DATE }), {
        [WHO]: <PersonName person={attribution.addedBy} />,
        [DATE]: date,
      })}
      {attribution.editedBy.length > 0 ? (
        <>
          {" "}
          {fill(t("editedBy", { who: WHO }), {
            [WHO]: <Names people={attribution.editedBy} and={and} />,
          })}
        </>
      ) : null}
    </p>
  );
}

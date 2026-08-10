/**
 * Export links for one recipe.
 *
 * Plain anchors rather than buttons, because each is a URL a tracker or script
 * can be pointed at directly — the point of the export surface is that it is
 * addressable, not that it is clickable.
 *
 * The serving count travels with the link, so what is exported is what is on
 * screen.
 */
export function ExportLinks({ slug, servings }: { slug: string; servings: number }) {
  const query = `?servings=${servings}`;
  const base = `/api/recipes/${slug}`;

  const links: ReadonlyArray<{ href: string; label: string; title: string }> = [
    {
      href: `${base}${query}`,
      label: "JSON",
      title: "Canonical machine format for this application",
    },
    {
      href: `${base}/export/json-ld${query}`,
      label: "JSON-LD",
      title: "schema.org Recipe — what most third-party importers parse",
    },
    {
      href: `${base}/export/csv${query}`,
      label: "CSV",
      title: "Ingredient rows with masses and macros, for a spreadsheet",
    },
    {
      href: `${base}/export/text${query}`,
      label: "For a tracker",
      title: "Plaintext block to paste into a macro tracker's recipe importer",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      <span>Export:</span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          title={link.title}
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:text-text"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

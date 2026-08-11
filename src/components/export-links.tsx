/**
 * Export links for one recipe.
 *
 * Plain anchors rather than buttons, because each is a URL a tracker or a
 * script can be pointed at directly — the point of the export surface is that
 * it is addressable, not that it is clickable. On a static site each is a real
 * file generated at build time.
 */
export function ExportLinks({ slug }: { slug: string }) {
  const base = `/recipes/${slug}/export`;

  const links: ReadonlyArray<{ href: string; label: string; title: string }> = [
    { href: `${base}/json/`, label: "JSON", title: "Canonical machine format" },
    {
      href: `${base}/jsonld/`,
      label: "JSON-LD",
      title: "schema.org Recipe — what most third-party importers parse",
    },
    {
      href: `${base}/csv/`,
      label: "CSV",
      title: "Ingredient rows with masses and macros, for a spreadsheet",
    },
    {
      href: `${base}/txt/`,
      label: "For a tracker",
      title: "Plaintext block for pasting into a tracker's recipe importer",
    },
  ];

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      <span>Export:</span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          title={link.title}
          className="underline hover:text-text"
        >
          {link.label}
        </a>
      ))}
    </p>
  );
}

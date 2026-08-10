/**
 * Reducing an HTML document to readable text.
 *
 * Used when a page publishes no structured recipe data and the prose has to be
 * read instead. Pure, and free of `server-only`, so the reduction is testable
 * without a database or an API key.
 *
 * Deliberately crude: script and style *contents* removed, block-level tags
 * turned into line breaks, remaining tags stripped, and the handful of entities
 * that actually occur in recipe text decoded. A real HTML parser would be more
 * faithful, but its failure mode on the malformed markup recipe sites are full
 * of is an exception, whereas this one's is slightly ragged text — and the
 * consumer is a language model, which reads ragged text perfectly well.
 *
 * The line breaks matter more than the fidelity. An ingredient list flattened
 * onto one line is materially harder to read back as a list than the same list
 * with its `</li>` boundaries preserved.
 */
export function htmlToText(html: string): string {
  return (
    html
      // Contents removed, not just the tags: a stripped <script> would
      // otherwise dump its source into the middle of the recipe.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      // Ampersand last: decoding it first would turn "&amp;lt;" into "<"
      // rather than the literal "&lt;" the document actually contained.
      .replace(/&amp;/gi, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim()
  );
}

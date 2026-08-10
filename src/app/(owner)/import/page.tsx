import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AiBudgetNote } from "@/components/ai-budget-note";
import { extractRecipe } from "@/lib/ai/extract";
import { htmlToText } from "@/lib/import/html-text";
import { saveDraft } from "@/lib/ai/drafts";
import { features } from "@/lib/env";
import { extractRecipeFromHtml } from "@/lib/import/jsonld";
import { parseIngredientBlock } from "@/lib/ingredient-parser";
import { createRecipe } from "@/lib/recipes";
import { attachPhotoFromSourcePage } from "@/lib/photos/attach";
import { db } from "@/lib/db";
import { parseBundle, parseCollection } from "@/lib/sharing/bundle";
import { fetchBundleFromUrl, importBundle } from "@/lib/sharing/exchange";

/**
 * Import a recipe from a URL or pasted text.
 *
 * Two deterministic paths, neither needing an API key:
 *
 *  - **URL**: fetch the page and read its schema.org JSON-LD. Most recipe sites
 *    publish it for search-engine rich results, so the site has already done
 *    the structuring for us — faster and more accurate than parsing prose.
 *  - **Paste**: split the text into an ingredients block and a method block on
 *    a heading, or on the first line that reads like prose rather than an
 *    ingredient.
 *
 * Claude handles the residue in phase 7: pages with no structured data, and
 * pasted text that does not separate cleanly.
 *
 * The result is not saved silently. It lands in the editor for review, because
 * an import that quietly writes a mis-parsed recipe is worse than one that
 * shows its work.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const categories = await db.category.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  const defaultCategoryId = categories[0]?.id ?? "";

  async function importFromUrl(formData: FormData): Promise<void> {
    "use server";
    const url = String(formData.get("url") ?? "").trim();
    if (!url) redirect("/import?error=empty");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      redirect("/import?error=badurl");
    }
    // Only http(s). Without this check, `file:` and other schemes would make
    // this endpoint a reader of the server's local filesystem.
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      redirect("/import?error=badurl");
    }

    let html: string;
    try {
      const response = await fetch(parsedUrl, {
        headers: {
          // Some sites serve a stub to unrecognised agents; identifying the
          // application honestly gets the real document more often than a
          // blank user agent does.
          "User-Agent": "recipes-app/0.1 (personal recipe importer)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) redirect("/import?error=fetch");
      html = await response.text();
    } catch {
      redirect("/import?error=fetch");
    }

    const extracted = extractRecipeFromHtml(html, parsedUrl.toString());
    if (!extracted) {
      redirect(
        features.ai ? "/import?error=nostructure-ai" : "/import?error=nostructure",
      );
    }

    const slug = await createRecipe({
      title: extracted.title,
      description: extracted.description,
      categoryId: defaultCategoryId,
      baseServings: extracted.servings ?? 4,
      servingLabel: "serving",
      prepMinutes: extracted.prepMinutes,
      cookMinutes: extracted.cookMinutes,
      sourceUrl: extracted.sourceUrl,
      notes: null,
      // Imported recipes are drafts until reviewed: the parse is good but not
      // guaranteed, and the category is a guess.
      status: "DRAFT",
      ingredientsText: extracted.ingredientsText,
      stepsText: extracted.stepsText,
      tagsText: "",
    });

    // Photo layer 1: the source page's own image. Attempted inline rather than
    // in the background because the import already took a network round trip,
    // and arriving in the editor with the photo already attached is the point.
    // A failure is deliberately silent: the recipe imported successfully, and
    // the placeholder is a working fallback.
    if (extracted.imageUrl) {
      const recipe = await db.recipe.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (recipe) {
        await attachPhotoFromSourcePage(
          recipe.id,
          extracted.imageUrl,
          parsedUrl.toString(),
        );
      }
    }

    revalidatePath("/");
    redirect(`/recipes/${slug}/edit`);
  }

  async function importFromText(formData: FormData): Promise<void> {
    "use server";
    const raw = String(formData.get("text") ?? "").trim();
    if (!raw) redirect("/import?error=empty");

    const lines = raw.split("\n").map((l) => l.trim());
    const title = lines[0] ?? "Imported recipe";

    // Find an explicit method heading; otherwise fall back to the first line
    // that parses with no quantity and reads like a sentence, which is what a
    // method step looks like and an ingredient line does not.
    const rest = lines.slice(1);
    let splitAt = rest.findIndex((l) =>
      /^(method|instructions|directions|steps)\b/i.test(l),
    );
    const dropHeading = splitAt !== -1;
    if (splitAt === -1) {
      splitAt = rest.findIndex((line) => {
        if (line.length === 0) return false;
        const parsed = parseIngredientBlock(line)[0];
        return parsed?.quantity === null && line.split(/\s+/).length > 8;
      });
    }
    if (splitAt === -1) splitAt = rest.length;

    const ingredientsText = rest.slice(0, splitAt).join("\n").trim();
    const stepsText = rest
      .slice(dropHeading ? splitAt + 1 : splitAt)
      .join("\n")
      .trim();

    const slug = await createRecipe({
      title,
      description: null,
      categoryId: defaultCategoryId,
      baseServings: 4,
      servingLabel: "serving",
      prepMinutes: null,
      cookMinutes: null,
      sourceUrl: null,
      notes: null,
      status: "DRAFT",
      ingredientsText,
      stepsText,
      tagsText: "",
    });

    revalidatePath("/");
    redirect(`/recipes/${slug}/edit`);
  }

  /**
   * Import from another instance's share link.
   *
   * The recipe arrives with its ingredient nutrition already resolved, so it is
   * accurate here immediately with no USDA key and no lookup.
   */
  /**
   * The Claude path, for what the deterministic readers cannot handle.
   *
   * Offered as a separate button rather than as an automatic fallback: it costs
   * money, and a fallback that spends silently whenever a parse fails is a
   * fallback the owner cannot budget for. The error message on a failed
   * structured-data import points here, so the escalation is one click.
   */
  async function importWithClaude(formData: FormData): Promise<void> {
    "use server";
    const url = String(formData.get("url") ?? "").trim();
    const pasted = String(formData.get("text") ?? "").trim();
    if (!url && !pasted) redirect("/import?error=empty");

    let text = pasted;
    let sourceUrl: string | null = null;

    if (url) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        redirect("/import?error=badurl");
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        redirect("/import?error=badurl");
      }
      try {
        const response = await fetch(parsedUrl, {
          headers: {
            "User-Agent": "recipes-app/0.1 (personal recipe importer)",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) redirect("/import?error=fetch");
        // Stripped to text before it reaches the model: markup is most of the
        // document and none of the recipe, and tokens are charged for both.
        text = htmlToText(await response.text());
        sourceUrl = parsedUrl.toString();
      } catch {
        redirect("/import?error=fetch");
      }
    }

    const result = await extractRecipe(text, { sourceUrl });
    if (!result.ok) {
      redirect(`/import?error=ai&detail=${encodeURIComponent(result.message)}`);
    }

    const saved = await saveDraft(result.data, { sourceUrl });
    revalidatePath("/");
    redirect(`/recipes/${saved.slug}/edit`);
  }

  async function importFromShareLink(formData: FormData): Promise<void> {
    "use server";
    const link = String(formData.get("shareUrl") ?? "").trim();
    if (!link) redirect("/import?error=empty");

    const fetched = await fetchBundleFromUrl(link);
    if (!fetched.ok) {
      redirect(`/import?error=bundle&detail=${encodeURIComponent(fetched.error)}`);
    }

    const outcome = await importBundle(fetched.bundle);
    revalidatePath("/");
    redirect(`/recipes/${outcome.slug}`);
  }

  /**
   * Import from an uploaded bundle file.
   *
   * Works when the source instance is private, offline, or gone — and is the
   * other half of the backup story, since the whole-collection export is read
   * by the same path.
   */
  async function importFromFile(formData: FormData): Promise<void> {
    "use server";
    const file = formData.get("bundle");
    if (!(file instanceof File) || file.size === 0) redirect("/import?error=empty");

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      redirect("/import?error=bundle&detail=That+file+is+not+valid+JSON.");
    }

    // A collection export is many bundles; a share download is one. Both arrive
    // through this control, so both are accepted.
    const collection = parseCollection(parsed);
    if (collection.ok) {
      let last = "";
      for (const bundle of collection.collection.recipes) {
        const outcome = await importBundle(bundle);
        last = outcome.slug;
      }
      revalidatePath("/");
      redirect(
        collection.collection.recipes.length === 1 && last ? `/recipes/${last}` : "/",
      );
    }

    const single = parseBundle(parsed);
    if (!single.ok) {
      redirect(`/import?error=bundle&detail=${encodeURIComponent(single.error)}`);
    }

    const outcome = await importBundle(single.bundle);
    revalidatePath("/");
    redirect(`/recipes/${outcome.slug}`);
  }

  const messages: Record<string, string> = {
    empty: "Nothing to import.",
    badurl: "That does not look like a web address.",
    fetch: "Could not fetch that page. It may be unreachable or blocking requests.",
    nostructure:
      "That page publishes no structured recipe data. Paste the recipe text below instead.",
    "nostructure-ai":
      "That page publishes no structured recipe data. Try “Read it with Claude” below, or paste the recipe text.",
  };
  const message = params.error
    ? params.error === "bundle" || params.error === "ai"
      ? (params.detail ?? "That import could not be completed.")
      : messages[params.error]
    : undefined;

  const inputClass =
    "w-full rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Import a recipe</h1>
      <p className="mt-1 text-sm text-text-muted">
        Imported recipes are saved as drafts and opened in the editor for review.
      </p>

      {message ? (
        <p
          className="mt-4 rounded-card bg-warn-soft px-3 py-2 text-sm text-warn"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      <form action={importFromUrl} className="mt-8 flex flex-col gap-2">
        <label htmlFor="url" className="text-sm font-medium">
          From a URL
        </label>
        <p className="text-xs text-text-muted">
          Reads the page&rsquo;s structured recipe data, including its photo. No API key
          needed.
        </p>
        <div className="flex gap-2">
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://example.com/recipes/…"
            className={inputClass}
          />
          <button
            type="submit"
            className="shrink-0 rounded-card bg-accent px-4 py-2 font-medium text-white"
          >
            Import
          </button>
        </div>
        {features.ai ? (
          <>
            <button
              type="submit"
              formAction={importWithClaude}
              className="self-start text-xs text-accent hover:underline"
            >
              Read it with Claude instead
            </button>
            <p className="text-xs text-text-muted">
              For pages with no structured data. Costs a model call, so it is a separate
              button rather than an automatic fallback.
            </p>
          </>
        ) : null}
      </form>

      <form action={importFromShareLink} className="mt-10 flex flex-col gap-2">
        <label htmlFor="shareUrl" className="text-sm font-medium">
          From a share link
        </label>
        <p className="text-xs text-text-muted">
          A <code>/r/…</code> link from another copy of this application. The recipe
          arrives with its ingredient nutrition already resolved.
        </p>
        <div className="flex gap-2">
          <input
            id="shareUrl"
            name="shareUrl"
            type="url"
            placeholder="https://their-recipes.example.com/r/…"
            className={inputClass}
          />
          <button
            type="submit"
            className="shrink-0 rounded-card border border-border bg-surface-2 px-4 py-2 font-medium"
          >
            Import
          </button>
        </div>
      </form>

      <form action={importFromFile} className="mt-10 flex flex-col gap-2">
        <label htmlFor="bundle" className="text-sm font-medium">
          From a file
        </label>
        <p className="text-xs text-text-muted">
          A downloaded <code>.recipe.json</code> bundle, or a whole-collection backup.
          Works when the other instance is private or offline.
        </p>
        <input
          id="bundle"
          name="bundle"
          type="file"
          accept="application/json,.json"
          className={inputClass}
        />
        <button
          type="submit"
          className="self-start rounded-card border border-border bg-surface-2 px-4 py-2 font-medium"
        >
          Import file
        </button>
      </form>

      <form action={importFromText} className="mt-10 flex flex-col gap-2">
        <label htmlFor="text" className="text-sm font-medium">
          From pasted text
        </label>
        <p className="text-xs text-text-muted">
          Title on the first line, then ingredients, then the method. A
          &ldquo;Method&rdquo; heading is used to split them if present.
        </p>
        <textarea
          id="text"
          name="text"
          rows={12}
          className={`${inputClass} font-mono text-sm`}
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="rounded-card border border-border bg-surface-2 px-4 py-2 font-medium"
          >
            Import text
          </button>
          {features.ai ? (
            <button
              type="submit"
              formAction={importWithClaude}
              className="text-xs text-accent hover:underline"
            >
              Read it with Claude instead
            </button>
          ) : null}
        </div>
        {features.ai ? (
          <>
            <p className="text-xs text-text-muted">
              Claude handles text that does not separate cleanly — a paragraph, an OCR
              scan, a message from a friend.
            </p>
            <AiBudgetNote />
          </>
        ) : null}
      </form>
    </div>
  );
}

"use client";

import type { PhotoSource } from "@/generated/prisma";
import type { PhotoCredit } from "@/lib/photos/attach";

/**
 * Photo attribution and replacement controls, shown under the hero image.
 *
 * Attribution is displayed for anything not uploaded by the owner, with a link
 * back to the page the image came from. Uploads carry no credit.
 *
 * This is the application's only client component, and only because a file
 * input should submit on selection rather than requiring a second click. The
 * Server Actions are passed in as props, so the mutation logic stays on the
 * server; if JavaScript is unavailable the form still submits via its button.
 */
export function PhotoControls({
  photoUrl,
  photoSource,
  photoCredit,
  uploadAction,
  clearAction,
  findAction,
  error,
}: {
  photoUrl: string | null;
  photoSource: PhotoSource | null;
  photoCredit: PhotoCredit | null;
  uploadAction: (formData: FormData) => Promise<void>;
  clearAction: () => Promise<void>;
  /** Absent when no Anthropic key is configured, which hides the control. */
  findAction?: (() => Promise<void>) | undefined;
  error?: string | undefined;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      {photoCredit?.pageUrl ? (
        <span>
          Photo:{" "}
          <a
            href={photoCredit.pageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text"
          >
            {photoCredit.siteName ?? "source"}
          </a>
        </span>
      ) : null}

      {photoSource === "UPLOAD" ? <span>Your photo</span> : null}

      <form action={uploadAction} className="flex items-center gap-2">
        <label className="cursor-pointer underline hover:text-text">
          {photoUrl ? "Replace photo" : "Add a photo"}
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="hidden"
            // Submitting on selection avoids a second click; the form is a
            // Server Action target, so this is the only JavaScript on the page.
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </label>
      </form>

      {findAction ? (
        <form action={findAction}>
          <button type="submit" className="underline hover:text-text">
            {photoUrl ? "Find another with Claude" : "Find one with Claude"}
          </button>
        </form>
      ) : null}

      {photoUrl ? (
        <form action={clearAction}>
          <button type="submit" className="underline hover:text-text">
            Remove
          </button>
        </form>
      ) : null}

      {error ? (
        <span className="text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

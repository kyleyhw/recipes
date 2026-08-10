import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { put, del } from "@vercel/blob";
import { env, features } from "@/lib/env";

/**
 * `exactOptionalPropertyTypes` rejects `{ token: string | undefined }` where the
 * library declares `token?: string`. The token is guaranteed present whenever
 * `features.blobStorage` is true, so it is narrowed once here rather than at
 * each call site.
 */
function blobToken(): { token: string } {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return { token };
}

/**
 * Image storage, with two interchangeable backends.
 *
 * Photos are **stored**, never hotlinked. A hotlinked URL rots when the source
 * reorganises, and serving images off someone else's bandwidth is rude.
 *
 * - **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set: the deployed path.
 * - **Local filesystem** otherwise: writes into `public/uploads/`, which Next
 *   serves as static assets at `/uploads/...`.
 *
 * The local backend exists so that `npm run dev` on a fresh clone has working
 * photos with no cloud account and no configuration — the same reason the
 * bundled PGlite server exists. It is not usable on Vercel, whose filesystem is
 * read-only at runtime, which is precisely why the token's presence is the
 * switch.
 */

const LOCAL_DIR = join(process.cwd(), "public", "uploads");

/** Where a stored image lives, as both a public URL and a deletable handle. */
export interface StoredImage {
  url: string;
  /** Opaque token for `deleteImage`; differs by backend. */
  handle: string;
}

export async function putImage(key: string, data: Buffer): Promise<StoredImage> {
  if (features.blobStorage) {
    const result = await put(key, data, {
      access: "public",
      contentType: "image/webp",
      ...blobToken(),
      // Keys are already content-addressed by the caller, so Vercel's random
      // suffix would only make the URL longer and defeat deduplication.
      addRandomSuffix: false,
    });
    return { url: result.url, handle: result.url };
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  await writeFile(join(LOCAL_DIR, safeKey), data);
  return { url: `/uploads/${safeKey}`, handle: safeKey };
}

/**
 * Removes a stored image. Failures are swallowed deliberately: an orphaned
 * image costs a little storage, whereas a failed delete that propagates would
 * block the user's actual intent (replacing or clearing a photo).
 */
export async function deleteImage(handle: string): Promise<void> {
  try {
    if (features.blobStorage) {
      await del(handle, blobToken());
    } else {
      await unlink(join(LOCAL_DIR, handle));
    }
  } catch {
    // Intentionally ignored; see above.
  }
}

/** Recovers the delete handle from a stored URL. */
export function handleFromUrl(url: string): string {
  return features.blobStorage ? url : (url.split("/").pop() ?? url);
}

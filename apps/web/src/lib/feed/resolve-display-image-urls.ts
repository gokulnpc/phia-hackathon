import type { SupabaseClient } from "@supabase/supabase-js";

/** Signed URL lifetime for try-on result images in the feed. */
export const FEED_TRYON_IMAGE_SIGN_TTL_SEC = 3600;

export type PostImageSource = {
  id: string;
  tryon_result_id: string | null;
  image_url: string;
};

export type PostWithDisplayImage = PostImageSource & { displayImageUrl: string };

/**
 * For each post, set displayImageUrl from a fresh storage signed URL when tryon_result_id is present;
 * otherwise fall back to image_url. Requires service-role client for signing.
 */
export async function attachDisplayImageUrls(
  admin: SupabaseClient,
  posts: PostImageSource[],
): Promise<PostWithDisplayImage[]> {
  const ids = Array.from(
    new Set(posts.map((p) => p.tryon_result_id).filter((x): x is string => Boolean(x))),
  );
  const pathByResultId = new Map<string, string>();

  if (ids.length > 0) {
    const { data: rows, error } = await admin
      .from("tryon_results")
      .select("id, storage_path")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) {
      console.error("[feed] tryon_results batch load failed", error.message);
    } else {
      for (const row of rows ?? []) {
        const id = row.id as string;
        const path = row.storage_path as string;
        if (id && path) pathByResultId.set(id, path);
      }
    }
  }

  return Promise.all(
    posts.map(async (p) => {
      let displayImageUrl = p.image_url;
      if (p.tryon_result_id) {
        const path = pathByResultId.get(p.tryon_result_id);
        if (path) {
          const { data: signed, error: signErr } = await admin.storage
            .from("tryon-results")
            .createSignedUrl(path, FEED_TRYON_IMAGE_SIGN_TTL_SEC);
          if (signErr || !signed?.signedUrl) {
            console.error("[feed] createSignedUrl failed", signErr?.message ?? "no url", p.id);
          } else {
            displayImageUrl = signed.signedUrl;
          }
        }
      }
      return { ...p, displayImageUrl };
    }),
  );
}

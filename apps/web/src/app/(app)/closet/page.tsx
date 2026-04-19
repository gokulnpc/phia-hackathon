import { redirect } from "next/navigation";
import { ClosetPageClient, type ClosetItemDTO } from "@/components/mirror/closet/ClosetPageClient";
import {
  confidenceLabel,
  hostFromUrl,
  normalizeClosetBucket,
  str,
} from "@/lib/mirror/closetUtils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type WishlistProductRow = {
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  primary_image_url?: string | null;
  price_usd?: number | null;
};

type ClosetItemRow = {
  id: string;
  created_at: string | null;
  products: WishlistProductRow | WishlistProductRow[] | null;
};

export default async function ClosetPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let triedItems: ClosetItemDTO[] = [];
  let wishlistItems: ClosetItemDTO[] = [];
  let ownedItems: ClosetItemDTO[] = [];

  try {
    const { data: results, error: resErr } = await supabase
      .from("tryon_results")
      .select("id, job_id, thumbnail_storage_path, storage_path, quality_score, generated_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("generated_at", { ascending: false })
      .limit(100);

    if (!resErr && results?.length) {
      const jobIds = Array.from(
        new Set(results.map((r) => r.job_id as string).filter(Boolean)),
      );
      const metaByJob = new Map<string, Record<string, unknown>>();

      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("tryon_jobs")
          .select("id, product_metadata")
          .in("id", jobIds)
          .eq("user_id", user.id);

        for (const j of jobs ?? []) {
          const id = j.id as string;
          const pm = j.product_metadata;
          if (typeof pm === "object" && pm !== null && !Array.isArray(pm)) {
            metaByJob.set(id, pm as Record<string, unknown>);
          }
        }
      }

      for (const row of results) {
        const jobId = row.job_id as string;
        const meta = metaByJob.get(jobId) ?? {};
        const name = str(meta.name) ?? "Try-on";
        const brand = str(meta.brand) ?? hostFromUrl(meta.page_url) ?? "—";
        const categoryBucket = normalizeClosetBucket(meta.category);

        const thumbPath = row.thumbnail_storage_path as string | null;
        const mainPath = row.storage_path as string | null;

        let thumbUrl: string | null = null;
        if (thumbPath) {
          const { data: t } = await supabase.storage.from("tryon-results").createSignedUrl(thumbPath, 3600);
          thumbUrl = t?.signedUrl ?? null;
        }
        if (!thumbUrl && mainPath) {
          const { data: m } = await supabase.storage.from("tryon-results").createSignedUrl(mainPath, 3600);
          thumbUrl = m?.signedUrl ?? null;
        }

        const price = meta.price_usd;
        const priceLabel =
          typeof price === "number" && Number.isFinite(price)
            ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(price)
            : null;

        triedItems.push({
          id: row.id as string,
          source: "tried",
          name,
          brand,
          category: categoryBucket,
          thumbUrl,
          confidenceLabel: confidenceLabel(row.quality_score),
          priceLabel,
          generatedAt: String(row.generated_at ?? ""),
        });
      }
    }
  } catch {
    triedItems = [];
  }

  try {
    const { data: closetRows, error: closetErr } = await supabase
      .from("closet_items")
      .select(
        `
        id,
        created_at,
        products (
          name,
          brand,
          category,
          primary_image_url,
          price_usd
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("kind", "wishlist")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!closetErr && closetRows?.length) {
      for (const row of closetRows as ClosetItemRow[]) {
        const raw = row.products;
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p || typeof p !== "object") continue;
        const priceUsd = p.price_usd;
        const priceLabel =
          typeof priceUsd === "number" && Number.isFinite(priceUsd)
            ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(priceUsd)
            : null;
        const categoryBucket = normalizeClosetBucket(p.category);
        wishlistItems.push({
          id: row.id,
          source: "wishlist",
          name: str(p.name) ?? "Saved item",
          brand: str(p.brand) ?? "—",
          category: categoryBucket,
          thumbUrl: str(p.primary_image_url),
          confidenceLabel: "—",
          priceLabel,
          generatedAt: String(row.created_at ?? ""),
        });
      }
    }
  } catch {
    wishlistItems = [];
  }

  try {
    const { data: ownedRows, error: ownedErr } = await supabase
      .from("closet_items")
      .select(
        `
        id,
        created_at,
        products (
          name,
          brand,
          category,
          primary_image_url,
          price_usd
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("kind", "owned")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!ownedErr && ownedRows?.length) {
      for (const row of ownedRows as ClosetItemRow[]) {
        const raw = row.products;
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p || typeof p !== "object") continue;
        const priceUsd = p.price_usd;
        const priceLabel =
          typeof priceUsd === "number" && Number.isFinite(priceUsd)
            ? new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: "USD",
              }).format(priceUsd)
            : null;
        const categoryBucket = normalizeClosetBucket(p.category);
        ownedItems.push({
          id: row.id,
          source: "owned",
          name: str(p.name) ?? "Owned item",
          brand: str(p.brand) ?? "—",
          category: categoryBucket,
          thumbUrl: str(p.primary_image_url),
          confidenceLabel: "—",
          priceLabel,
          generatedAt: String(row.created_at ?? ""),
        });
      }
    }
  } catch {
    ownedItems = [];
  }

  return (
    <ClosetPageClient
      triedItems={triedItems}
      wishlistItems={wishlistItems}
      ownedItems={ownedItems}
    />
  );
}

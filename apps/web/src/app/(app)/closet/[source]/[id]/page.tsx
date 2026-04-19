import { notFound, redirect } from "next/navigation";
import {
  ClosetDetailClient,
  type ClosetDetailViewModel,
} from "@/components/mirror/closet/ClosetDetailClient";
import {
  confidenceLabel,
  hostFromUrl,
  normalizeClosetBucket,
  str,
} from "@/lib/mirror/closetUtils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ source: string; id: string }> };

async function signedTryOnUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  thumbPath: string | null,
  mainPath: string | null,
): Promise<string | null> {
  if (mainPath) {
    const { data: m } = await supabase.storage
      .from("tryon-results")
      .createSignedUrl(mainPath, 3600);
    if (m?.signedUrl) return m.signedUrl;
  }
  if (thumbPath) {
    const { data: t } = await supabase.storage
      .from("tryon-results")
      .createSignedUrl(thumbPath, 3600);
    return t?.signedUrl ?? null;
  }
  return null;
}

async function signedTryOnVideoUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  videoPath: string | null,
): Promise<string | null> {
  if (!videoPath) return null;
  const { data } = await supabase.storage
    .from("tryon-results")
    .createSignedUrl(videoPath, 3600);
  return data?.signedUrl ?? null;
}

export default async function ClosetDetailPage({ params }: PageProps) {
  const { source, id } = await params;
  if (source !== "tried" && source !== "wishlist" && source !== "owned") {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let detail: ClosetDetailViewModel;

  if (source === "tried") {
    const { data: row, error: rErr } = await supabase
      .from("tryon_results")
      .select(
        "id, job_id, thumbnail_storage_path, storage_path, video_storage_path, quality_score, generated_at",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (rErr || !row) {
      notFound();
    }

    const jobId = row.job_id as string;
    let meta: Record<string, unknown> = {};
    if (jobId) {
      const { data: job } = await supabase
        .from("tryon_jobs")
        .select("id, product_metadata")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      const pm = job?.product_metadata;
      if (typeof pm === "object" && pm !== null && !Array.isArray(pm)) {
        meta = pm as Record<string, unknown>;
      }
    }

    const name = str(meta.name) ?? "Try-on";
    const brand = str(meta.brand) ?? hostFromUrl(meta.page_url) ?? "—";
    const categoryBucket = normalizeClosetBucket(meta.category);
    const pageUrl = str(meta.page_url);
    const retailerLabel = pageUrl ? hostFromUrl(pageUrl) : null;

    const price = meta.price_usd;
    const priceLabel =
      typeof price === "number" && Number.isFinite(price)
        ? new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "USD",
          }).format(price)
        : null;

    const imageUrl = await signedTryOnUrl(
      supabase,
      row.thumbnail_storage_path as string | null,
      row.storage_path as string | null,
    );
    const videoUrl = await signedTryOnVideoUrl(
      supabase,
      (row as { video_storage_path?: string | null }).video_storage_path ??
        null,
    );

    const { data: postRow } = await supabase
      .from("posts")
      .select("id, caption, reaction_count, comment_count")
      .eq("tryon_result_id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let recentComments: { body: string; createdAt: string }[] = [];
    if (postRow?.id) {
      const { data: comms } = await supabase
        .from("comments")
        .select("body, created_at")
        .eq("post_id", postRow.id as string)
        .is("deleted_at", null)
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(5);

      recentComments =
        comms?.map((c) => ({
          body: String(c.body ?? ""),
          createdAt: String(c.created_at ?? ""),
        })) ?? [];
    }

    detail = {
      source: "tried",
      id: row.id as string,
      name,
      brand,
      category: categoryBucket,
      priceLabel,
      pageUrl,
      retailerLabel,
      imageUrl,
      videoUrl,
      userId: user.id,
      tryonResultId: row.id as string,
      confidenceLabel: confidenceLabel(row.quality_score),
      generatedAt: String(row.generated_at ?? ""),
      post: postRow
        ? {
            id: postRow.id as string,
            reactionCount: Number(postRow.reaction_count ?? 0),
            commentCount: Number(postRow.comment_count ?? 0),
            caption: str(postRow.caption),
          }
        : null,
      recentComments,
    };
  } else if (source === "wishlist") {
    const { data: ci, error: cErr } = await supabase
      .from("closet_items")
      .select(
        `
        id,
        tryon_result_id,
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
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("kind", "wishlist")
      .maybeSingle();

    if (cErr || !ci) {
      notFound();
    }

    const raw = ci.products as unknown;
    const p = Array.isArray(raw) ? raw[0] : raw;
    if (!p || typeof p !== "object") {
      notFound();
    }
    const prod = p as Record<string, unknown>;

    const name = str(prod.name) ?? "Saved item";
    const brand = str(prod.brand) ?? "—";
    const categoryBucket = normalizeClosetBucket(prod.category);
    const priceUsd = prod.price_usd;
    const priceLabel =
      typeof priceUsd === "number" && Number.isFinite(priceUsd)
        ? new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "USD",
          }).format(priceUsd)
        : null;
    const imageUrl = str(prod.primary_image_url);

    const tryonResultId = ci.tryon_result_id as string | null;
    let postRow: {
      id: string;
      caption: string | null;
      reaction_count: number;
      comment_count: number;
    } | null = null;

    if (tryonResultId) {
      const { data: pr } = await supabase
        .from("posts")
        .select("id, caption, reaction_count, comment_count")
        .eq("tryon_result_id", tryonResultId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pr) {
        postRow = {
          id: pr.id as string,
          caption: str(pr.caption),
          reaction_count: Number(pr.reaction_count ?? 0),
          comment_count: Number(pr.comment_count ?? 0),
        };
      }
    }

    let recentComments: { body: string; createdAt: string }[] = [];
    if (postRow) {
      const { data: comms } = await supabase
        .from("comments")
        .select("body, created_at")
        .eq("post_id", postRow.id)
        .is("deleted_at", null)
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(5);

      recentComments =
        comms?.map((c) => ({
          body: String(c.body ?? ""),
          createdAt: String(c.created_at ?? ""),
        })) ?? [];
    }

    detail = {
      source: "wishlist",
      id: ci.id as string,
      name,
      brand,
      category: categoryBucket,
      priceLabel,
      pageUrl: null,
      retailerLabel: null,
      imageUrl,
      videoUrl: null,
      userId: user.id,
      tryonResultId: null,
      confidenceLabel: null,
      generatedAt: String(ci.created_at ?? ""),
      post: postRow
        ? {
            id: postRow.id,
            reactionCount: postRow.reaction_count,
            commentCount: postRow.comment_count,
            caption: postRow.caption,
          }
        : null,
      recentComments,
    };
  } else if (source === "owned") {
    const { data: ci, error: cErr } = await supabase
      .from("closet_items")
      .select(
        `
        id,
        tryon_result_id,
        created_at,
        products (
          name,
          brand,
          category,
          primary_image_url,
          price_usd,
          canonical_url
        )
      `,
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("kind", "owned")
      .maybeSingle();

    if (cErr || !ci) {
      notFound();
    }

    const raw = ci.products as unknown;
    const p = Array.isArray(raw) ? raw[0] : raw;
    if (!p || typeof p !== "object") {
      notFound();
    }
    const prod = p as Record<string, unknown>;

    const name = str(prod.name) ?? "Owned item";
    const brand = str(prod.brand) ?? "—";
    const categoryBucket = normalizeClosetBucket(prod.category);
    const priceUsd = prod.price_usd;
    const priceLabel =
      typeof priceUsd === "number" && Number.isFinite(priceUsd)
        ? new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "USD",
          }).format(priceUsd)
        : null;
    const imageUrl = str(prod.primary_image_url);
    const pageUrl = str(prod.canonical_url);
    const retailerLabel = pageUrl ? hostFromUrl(pageUrl) : null;

    detail = {
      source: "owned",
      id: ci.id as string,
      name,
      brand,
      category: categoryBucket,
      priceLabel,
      pageUrl: pageUrl || null,
      retailerLabel,
      imageUrl,
      videoUrl: null,
      userId: user.id,
      tryonResultId: null,
      confidenceLabel: null,
      generatedAt: String(ci.created_at ?? ""),
      post: null,
      recentComments: [],
    };
  } else {
    notFound();
  }

  return <ClosetDetailClient detail={detail} />;
}

import { NextResponse } from "next/server";
import { attachDisplayImageUrls } from "@/lib/feed/resolve-display-image-urls";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_BATCH = 20;

export async function POST(req: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server signing unavailable" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const postIdsRaw =
    body && typeof body === "object" && body !== null && "postIds" in body
      ? (body as { postIds: unknown }).postIds
      : undefined;
  const postIds = Array.from(
    new Set(
      Array.isArray(postIdsRaw)
        ? postIdsRaw.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [],
    ),
  ).slice(0, MAX_BATCH);

  if (postIds.length === 0) {
    return NextResponse.json({ urls: {} as Record<string, string> });
  }

  const { data: visible, error } = await supabase
    .from("posts")
    .select("id, tryon_result_id, image_url")
    .in("id", postIds)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (visible ?? []).map((r) => ({
    id: String(r.id),
    tryon_result_id: r.tryon_result_id != null ? String(r.tryon_result_id) : null,
    image_url: String(r.image_url ?? ""),
  }));

  const enriched = await attachDisplayImageUrls(admin, rows);
  const urls: Record<string, string> = {};
  for (const p of enriched) {
    urls[p.id] = p.displayImageUrl;
  }
  return NextResponse.json({ urls });
}

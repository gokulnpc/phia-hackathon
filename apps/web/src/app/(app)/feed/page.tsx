import { redirect } from "next/navigation";
import { attachDisplayImageUrls } from "@/lib/feed/resolve-display-image-urls";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FeedComposerPlaceholder } from "@/components/mirror/FeedComposerPlaceholder";
import { FeedRightSidebar } from "@/components/mirror/FeedRightSidebar";
import { FeedTabBar } from "@/components/mirror/FeedTabBar";
import { MirrorPageHeader } from "@/components/mirror/MirrorPageHeader";
import { FeedClient, type FeedPost } from "./FeedClient";

function composerInitial(email: string | undefined): string {
  if (!email || !email.includes("@")) return "?";
  return email.split("@")[0]!.slice(0, 1).toUpperCase();
}

export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: posts } = await supabase
    .from("posts")
    .select(
      "id, caption, image_url, tryon_result_id, user_id, reaction_count, created_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const rawRows = (posts ?? []).map((r) => ({
    id: String(r.id),
    caption: r.caption != null ? String(r.caption) : null,
    image_url: String(r.image_url ?? ""),
    tryon_result_id:
      r.tryon_result_id != null ? String(r.tryon_result_id) : null,
    user_id: String(r.user_id),
    reaction_count: Number(r.reaction_count ?? 0),
    created_at: String(r.created_at ?? ""),
  }));
  const sources = rawRows.map((r) => ({
    id: r.id,
    tryon_result_id: r.tryon_result_id,
    image_url: r.image_url,
  }));
  const admin = createSupabaseAdminClient();
  let initial: FeedPost[];
  if (admin) {
    const signed = await attachDisplayImageUrls(admin, sources);
    const byId = new Map(signed.map((s) => [s.id, s.displayImageUrl]));
    initial = rawRows.map((r) => ({
      ...r,
      displayImageUrl: byId.get(r.id) ?? r.image_url,
    }));
  } else {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[feed] SUPABASE_SERVICE_ROLE_KEY is not set; feed images may be expired or inaccessible for other users' posts."
      );
    }
    initial = rawRows.map((r) => ({
      ...r,
      displayImageUrl: r.image_url,
    }));
  }

  return (
    <div className="page-enter">
      {/* Full width of main; hairline inset so content doesn’t kiss the viewport edge. */}
      <div className="w-full max-w-none pl-2 pr-2 pb-12 pt-6 md:pl-3 md:pr-4 md:pb-[52px] md:pt-7 lg:pl-4">
        <MirrorPageHeader
          flush
          eyebrow="TODAY"
          leadingTitle="The"
          accentWord="fit feed."
          subtitle="Fresh fits from your circle."
          right={<FeedTabBar />}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            <FeedComposerPlaceholder
              userInitial={composerInitial(user.email ?? undefined)}
              seed={user.id}
            />
            {initial.length === 0 ? (
              <div className="rounded-mirror border-[1.5px] border-dashed border-hair bg-card p-8 text-center">
                <p className="font-display text-[22px] font-normal leading-[1.15] tracking-[-0.01em] text-ink">
                  Nothing <span className="ital text-ink3">here yet.</span>
                </p>
                <p className="body-sm mt-3 text-ink3">
                  Share a try-on from the extension.
                </p>
              </div>
            ) : (
              <FeedClient initialPosts={initial} currentUserId={user.id} />
            )}
          </div>
          <FeedRightSidebar />
        </div>
      </div>
    </div>
  );
}

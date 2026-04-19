import { useEffect, useState, type JSX } from "react";

function PostImage({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!src.trim()) {
    return (
      <div className="flex h-full min-h-[40%] w-full items-center justify-center px-4 text-center text-[11px] text-mirror-muted">
        No image URL
      </div>
    );
  }
  if (!ok) {
    return (
      <div className="flex h-full min-h-[40%] w-full items-center justify-center px-4 text-center text-[11px] text-mirror-muted">
        Image expired or unavailable. Open the web feed for a fresh view.
      </div>
    );
  }
  return (
    <img src={src} alt="" className="h-full w-full object-cover" onError={() => setOk(false)} />
  );
}
import { createExtensionSupabase } from "../../lib/supabase";
import { getMirrorWebBase, openMirrorWebPath } from "../../lib/openWeb";
import { DemoSocialStrip } from "../components/DemoSocialStrip";
import { IconHeart, IconMessage, IconShare } from "../icons";

const FEED_POST_LIMIT = 8;
const SIGNED_URL_TTL_SEC = 3600;

type PostRow = {
  id: string;
  caption: string | null;
  image_url: string;
  created_at: string;
  tryon_result_id: string | null;
  reaction_count: number;
  comment_count: number;
};

function displayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  const full = meta.full_name;
  if (typeof full === "string" && full.trim()) return full.trim();
  const email = user.email?.trim();
  if (email?.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "You";
}

function profileInitial(label: string): string {
  const t = label.trim();
  return t ? t.slice(0, 1).toUpperCase() : "?";
}

async function sharePost(caption: string | null, webBase: string | undefined): Promise<void> {
  const text = caption?.trim() || "Fit check";
  const shareUrl = webBase ? `${webBase}/feed` : undefined;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Mirror fit feed",
        text,
        url: shareUrl,
      });
      return;
    } catch {
      /* fall back below */
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl ? `${text} ${shareUrl}` : text);
      return;
    } catch {
      /* fall back below */
    }
  }

  if (shareUrl) {
    openMirrorWebPath("/feed");
  }
}

async function signTryOnResultUrl(
  sb: ReturnType<typeof createExtensionSupabase>,
  storagePath: string | null,
  thumbPath: string | null,
): Promise<string | null> {
  const main = typeof storagePath === "string" && storagePath.trim() ? storagePath.trim() : null;
  const thumb = typeof thumbPath === "string" && thumbPath.trim() ? thumbPath.trim() : null;
  const path = main ?? thumb;
  if (!path) return null;
  const { data, error } = await sb.storage.from("tryon-results").createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export type FeedViewProps = {
  /** After share in this session — shows labeled demo strip on the matching post. */
  posted?: boolean;
  lastSharedPostId?: string | null;
  lastTryOnImageUrl?: string;
  /** Incremented on successful share so feed refetches when this tab opens. */
  refreshKey?: number;
};

export function FeedView({
  posted = false,
  lastSharedPostId = null,
  lastTryOnImageUrl = "",
  refreshKey = 0,
}: FeedViewProps): JSX.Element {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [imageByPostId, setImageByPostId] = useState<Record<string, string>>({});
  const [authorLabel, setAuthorLabel] = useState<string>("You");
  const [authorInitial, setAuthorInitial] = useState<string>("?");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setLoadError(null);
      setNoSession(false);
      const sb = createExtensionSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLoading(false);
        setNoSession(true);
        setPosts([]);
        setImageByPostId({});
        return;
      }

      const label = displayNameFromUser(user);
      setAuthorLabel(label);
      setAuthorInitial(profileInitial(label));

      const { data: rows, error } = await sb
        .from("posts")
        .select("id, caption, image_url, created_at, tryon_result_id, reaction_count, comment_count")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(FEED_POST_LIMIT);

      if (cancelled) return;
      if (error) {
        setLoading(false);
        setLoadError(error.message);
        return;
      }

      const list = (rows ?? []) as PostRow[];
      const resultIds = Array.from(
        new Set(
          list.map((p) => p.tryon_result_id).filter((id): id is string => typeof id === "string" && Boolean(id)),
        ),
      );

      const signedByResultId = new Map<string, string>();
      if (resultIds.length > 0) {
        const { data: results, error: resErr } = await sb
          .from("tryon_results")
          .select("id, storage_path, thumbnail_storage_path")
          .in("id", resultIds)
          .eq("user_id", user.id)
          .is("deleted_at", null);

        if (!cancelled && !resErr && results?.length) {
          await Promise.all(
            (results as { id: string; storage_path: string | null; thumbnail_storage_path: string | null }[]).map(
              async (r) => {
                const url = await signTryOnResultUrl(sb, r.storage_path, r.thumbnail_storage_path);
                if (url) signedByResultId.set(r.id, url);
              },
            ),
          );
        }
      }

      const nextImages: Record<string, string> = {};
      for (const p of list) {
        if (p.tryon_result_id) {
          const signed = signedByResultId.get(p.tryon_result_id);
          if (signed) {
            nextImages[p.id] = signed;
            continue;
          }
        }
        if (typeof p.image_url === "string" && p.image_url.trim()) {
          nextImages[p.id] = p.image_url.trim();
        }
      }

      if (cancelled) return;
      setPosts(list);
      setImageByPostId(nextImages);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const webBase = getMirrorWebBase();

  if (loading) {
    return (
      <div className="flex flex-col gap-3 py-6" aria-busy="true" aria-live="polite">
        <div className="mx-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-normal italic text-mirror-text">
            The <em className="italic">fit feed</em>
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mirror-accent" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">Live</span>
          </div>
        </div>
        <p className="mx-1 text-[12.5px] leading-snug text-mirror-muted">Fresh fits from your circle · today</p>
        <p className="mx-1 text-[11px] leading-relaxed text-mirror-faint">Gathering your latest posts.</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="space-y-3 py-6">
        <div className="mx-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-normal italic text-mirror-text">
            The <em className="italic">fit feed</em>
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mirror-accent" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">Live</span>
          </div>
        </div>
        <p className="mx-1 text-center text-[13px] leading-relaxed text-mirror-danger">{loadError}</p>
      </div>
    );
  }
  if (noSession) {
    return (
      <div className="mx-1 space-y-3 py-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-normal italic text-mirror-text">
            The <em className="italic">fit feed</em>
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mirror-accent" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">Live</span>
          </div>
        </div>
        <p className="text-[13.5px] leading-[1.55] text-mirror-muted">Sign in to read your posts here.</p>
      </div>
    );
  }
  if (posts.length === 0) {
    const showSharePreview = posted && lastTryOnImageUrl.trim().length > 0;
    return (
      <div className="flex flex-col gap-3 py-6">
        <div className="mx-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-normal italic text-mirror-text">
            The <em className="italic">fit feed</em>
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mirror-accent" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">Live</span>
          </div>
        </div>
        <p className="mx-1 text-[12.5px] leading-snug text-mirror-muted">Fresh fits from your circle · today</p>
        {showSharePreview ? (
          <div className="mx-1 flex flex-col gap-2">
            <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-accent">
              Demo preview · your share may take a beat to index
            </p>
            <article className="overflow-hidden rounded-card bg-mirror-card">
              <div className="flex items-center gap-2.5 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mirror-ink2 text-[13px] font-semibold text-white">
                  {authorInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{authorLabel}</div>
                  <div className="text-[11px] text-mirror-faint">Just shared · demo</div>
                </div>
              </div>
              <div className="relative flex aspect-[4/5] w-full items-center justify-center bg-mirror-bg2">
                <PostImage src={lastTryOnImageUrl.trim()} />
              </div>
              <div className="p-3.5">
                <p className="text-[13px] leading-relaxed text-mirror-ink2">Your try-on will appear here after refresh.</p>
              </div>
            </article>
            <DemoSocialStrip />
          </div>
        ) : (
          <p className="mx-1 text-center text-[13.5px] leading-[1.55] text-mirror-muted">
            Nothing here yet. Share a try-on from the Try-on tab.
          </p>
        )}
        {webBase ? (
          <button
            type="button"
            onClick={() => openMirrorWebPath("/feed")}
            className="mx-auto mt-2 rounded-full border border-mirror-border bg-mirror-card px-4 py-2 text-xs font-medium text-mirror-text transition-colors hover:bg-mirror-panel"
          >
            Open web to see more
          </button>
        ) : (
          <p className="text-center text-[11px] text-mirror-faint">
            Set <span className="font-mono">VITE_MIRROR_WEB_URL</span> to open the full feed in your browser.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="mx-1 mt-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-normal italic text-mirror-text">
            The <em className="italic">fit feed</em>
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mirror-accent" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">Live</span>
          </div>
        </div>
        <p className="text-[12.5px] leading-snug text-mirror-muted">Fresh fits from your circle · today</p>
      </div>

      {posts.map((p) => {
        const src = imageByPostId[p.id] ?? p.image_url;
        const showDemoStrip =
          posted &&
          lastSharedPostId !== null &&
          lastSharedPostId === p.id &&
          p.comment_count === 0;
        return (
          <div key={p.id} className="flex flex-col gap-2">
            <article className="overflow-hidden rounded-card bg-mirror-card">
              <div className="flex items-center gap-2.5 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mirror-ink2 text-[13px] font-semibold text-white">
                  {authorInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{authorLabel}</div>
                  <div className="text-[11px] text-mirror-faint">{new Date(p.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="relative flex aspect-[4/5] w-full items-center justify-center bg-mirror-bg2">
                <PostImage src={src} />
              </div>
              <div className="p-3.5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mirror-text px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white">
                    Try-on
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-mirror-ink2">{p.caption ?? "Fit check"}</p>
                <div className="mt-3 flex items-center gap-5 text-mirror-ink2">
                  <span className="inline-flex items-center gap-1.5 text-[12px]">
                    <IconHeart className="h-[15px] w-[15px]" />
                    <span>{p.reaction_count}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12px]">
                    <IconMessage className="h-[15px] w-[15px]" />
                    <span>{p.comment_count}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void sharePost(p.caption, webBase)}
                    className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-mirror-muted transition-colors hover:text-mirror-text"
                    aria-label="Share post"
                  >
                    <IconShare className="h-[14px] w-[14px]" />
                    <span>share</span>
                  </button>
                </div>
              </div>
            </article>
            {showDemoStrip ? <DemoSocialStrip showSectionTitle /> : null}
          </div>
        );
      })}

      <div className="mx-1 mt-2 border-t border-mirror-border/60 pt-4">
        {webBase ? (
          <button
            type="button"
            onClick={() => openMirrorWebPath("/feed")}
            className="w-full rounded-full border border-mirror-border bg-mirror-card py-2.5 text-center text-xs font-medium text-mirror-text transition-colors hover:bg-mirror-panel"
          >
            Open web to see more
          </button>
        ) : (
          <p className="text-center text-[11px] leading-relaxed text-mirror-faint">
            Set <span className="font-mono">VITE_MIRROR_WEB_URL</span> in the extension env to open the full feed in
            your browser.
          </p>
        )}
      </div>
    </div>
  );
}

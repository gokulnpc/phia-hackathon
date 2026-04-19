"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Avatar,
  IconBtn,
  pickAvatarVariant,
  type AccentVariant,
} from "@/components/mirror/primitives";

export type FeedPost = {
  id: string;
  caption: string | null;
  image_url: string;
  tryon_result_id: string | null;
  displayImageUrl: string;
  user_id: string;
  reaction_count: number;
  created_at: string;
};

const SIGN_URL_BATCH = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Italicise the last word of the caption with the screen's accent colour. */
function renderCaption(caption: string) {
  const trimmed = caption.trim();
  if (!trimmed) return null;
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) {
    return (
      <span className="ital" style={{ color: "var(--accent)" }}>
        {trimmed}
      </span>
    );
  }
  const before = trimmed.slice(0, lastSpace + 1);
  const last = trimmed.slice(lastSpace + 1);
  return (
    <>
      {before}
      <span className="ital" style={{ color: "var(--accent)" }}>
        {last}
      </span>
    </>
  );
}

function FeedPostCard({
  post: p,
  currentUserId,
  onReact,
}: {
  post: FeedPost;
  currentUserId: string;
  onReact: (postId: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [hearted, setHearted] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [p.displayImageUrl]);

  const initial = p.user_id.slice(0, 1).toUpperCase();
  const isSelf = p.user_id === currentUserId;
  /** Current-user avatars use rose on soft rose — matches design.md + phia_web sample. */
  const variant: AccentVariant = isSelf ? "rose" : pickAvatarVariant(p.user_id);
  const showImg = Boolean(p.displayImageUrl) && !imgFailed;

  return (
    <li className="overflow-hidden rounded-mirror border border-hair bg-card">
      {/* head */}
      <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-5 pt-4 pb-3">
        <Avatar letter={initial} variant={variant} size="md" />
        <div className="flex min-w-0 flex-col">
          <div className="text-[13.5px] font-medium text-ink">
            {isSelf ? "You" : `Member ${shortId(p.user_id)}`}
          </div>
          <div className="meta truncate">
            @{shortId(p.user_id)} · {formatTime(p.created_at)}
          </div>
        </div>
        <IconBtn aria-label="More">
          <MoreIcon />
        </IconBtn>
      </div>

      {/* media */}
      <div className="relative mx-5 aspect-[4/5] overflow-hidden rounded-[12px] border border-hair bg-bg2">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.displayImageUrl}
            alt=""
            className="h-full w-full object-cover object-center"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="ph ph-cool absolute inset-0 !rounded-[12px]">
            <div className="ph-cap ph-cap-center">
              {p.displayImageUrl ? "IMAGE UNAVAILABLE" : "LOADING…"}
            </div>
          </div>
        )}
      </div>

      {/* caption */}
      {p.caption ? (
        <p className="display-sm px-5 pt-3.5 text-ink">
          {renderCaption(p.caption)}
        </p>
      ) : null}

      {/* footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-[18px] pt-3.5">
        <div className="flex items-center gap-1">
          <ReactBtn
            on={false}
            tone="fire"
            onClick={() => onReact(p.id)}
            count={p.reaction_count}
          >
            <FireIcon />
          </ReactBtn>
          <ReactBtn
            on={hearted}
            tone="heart"
            onClick={() => setHearted((v) => !v)}
          >
            <HeartIcon filled={hearted} />
          </ReactBtn>
          <ReactBtn on={false} tone="none">
            <CommentIcon /> <span className="ml-1">—</span>
          </ReactBtn>
          <ReactBtn on={false} tone="none">
            <ShareIcon />
          </ReactBtn>
        </div>
        <button
          type="button"
          className="rounded-full border border-hair px-3 py-1.5 text-[12px] font-medium text-ink2 transition-colors hover:border-ink hover:text-ink"
        >
          Try it on yourself
        </button>
      </div>
    </li>
  );
}

function ReactBtn({
  on,
  tone,
  children,
  count,
  onClick,
}: {
  on: boolean;
  tone: "fire" | "heart" | "none";
  children: React.ReactNode;
  count?: number;
  onClick?: () => void;
}) {
  const onClass =
    tone === "fire"
      ? "bg-peach-soft text-peach border-peach-soft"
      : tone === "heart"
        ? "bg-rose-soft border-rose-soft text-danger"
        : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[12.5px] text-ink2 transition-colors duration-150 ease-out hover:border-hair ${
        on ? onClass : ""
      }`}
    >
      {children}
      {count != null ? <span className="ml-1">{count}</span> : null}
    </button>
  );
}

function FireIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5C8 9 9 8 9 6c1 .5 2 1 3-3Z" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-12 7L4 20l1-5a8 8 0 1 1 16-3Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  );
}

export function FeedClient({
  initialPosts,
  currentUserId,
}: {
  initialPosts: FeedPost[];
  currentUserId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [error, setError] = useState<string | null>(null);

  const mergePost = useCallback((row: Record<string, unknown>) => {
    const id = String(row.id ?? "");
    if (!id) return;
    setPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const tryon_result_id =
        row.tryon_result_id != null ? String(row.tryon_result_id) : null;
      const image_url = String(row.image_url ?? "");
      const prevRow = idx >= 0 ? prev[idx] : null;

      let displayImageUrl: string;
      if (tryon_result_id) {
        if (
          prevRow &&
          prevRow.tryon_result_id === tryon_result_id &&
          prevRow.image_url === image_url &&
          prevRow.displayImageUrl
        ) {
          displayImageUrl = prevRow.displayImageUrl;
        } else {
          displayImageUrl = "";
        }
      } else {
        displayImageUrl = image_url;
      }

      const next: FeedPost = {
        id,
        caption: row.caption != null ? String(row.caption) : null,
        image_url,
        tryon_result_id,
        displayImageUrl,
        user_id: String(row.user_id ?? ""),
        reaction_count: Number(row.reaction_count ?? 0),
        created_at: String(row.created_at ?? ""),
      };
      if (idx === -1) {
        return [next, ...prev].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        );
      }
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...next };
      return copy;
    });
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("mirror-feed-posts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        (payload) => {
          if (
            payload.eventType === "INSERT" ||
            payload.eventType === "UPDATE"
          ) {
            mergePost(payload.new as Record<string, unknown>);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, mergePost]);

  const pendingSignKey = useMemo(
    () =>
      posts
        .filter((p) => p.tryon_result_id && p.displayImageUrl === "")
        .map((p) => p.id)
        .sort()
        .join(","),
    [posts],
  );

  useEffect(() => {
    const ids = pendingSignKey ? pendingSignKey.split(",").filter(Boolean) : [];
    if (ids.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const batch of chunk(ids, SIGN_URL_BATCH)) {
        if (cancelled) break;
        const res = await fetch("/api/feed/signed-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postIds: batch }),
        });
        if (!res.ok || cancelled) continue;
        const body = (await res.json()) as { urls?: Record<string, string> };
        const urls = body.urls ?? {};
        setPosts((prev) =>
          prev.map((p) => {
            const u = urls[p.id];
            if (u != null && u !== "") {
              return { ...p, displayImageUrl: u };
            }
            return p;
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingSignKey]);

  async function fireReaction(postId: string) {
    setError(null);
    const { error: err } = await supabase.from("reactions").insert({
      post_id: postId,
      user_id: currentUserId,
      reaction_type: "fire",
    });
    if (err) {
      if (err.code === "23505" || err.message.includes("duplicate")) {
        setError("You already reacted to that post.");
      } else {
        setError(err.message);
      }
    }
  }

  return (
    <>
      {error ? (
        <p className="mb-4 rounded-mirror-sm border border-danger/30 bg-rose-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-4">
        {posts.map((p) => (
          <FeedPostCard
            key={p.id}
            post={p}
            currentUserId={currentUserId}
            onReact={(id) => void fireReaction(id)}
          />
        ))}
      </ul>
    </>
  );
}

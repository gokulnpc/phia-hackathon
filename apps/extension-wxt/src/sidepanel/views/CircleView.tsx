import { useEffect, useState, type ReactNode } from "react";
import {
  readPageUrlFromProductMetadata,
  urlsMatchForSpotlight,
} from "../../lib/circleSpotlight";
import { createExtensionSupabase } from "../../lib/supabase";
import { shouldShowDemoFriendThread } from "../../lib/demoSocialPreview";
import { DemoSocialStrip } from "../components/DemoSocialStrip";
import { getMirrorWebBase, openMirrorWebPath } from "../../lib/openWeb";
import { spotlightHostFromUrl } from "../../lib/spotlightHost";
import { IconCircle, IconPlus, IconSparkleOutline } from "../icons";

const CIRCLE_POST_SCAN = 50;
const COMMENTS_LIMIT = 20;
const SIGNED_URL_TTL_SEC = 3600;

type PostRow = {
  id: string;
  caption: string | null;
  image_url: string;
  created_at: string;
  tryon_result_id: string | null;
  product_id: string | null;
  reaction_count: number;
  comment_count: number;
};

type TryonResultRow = {
  id: string;
  job_id: string;
  storage_path: string | null;
  thumbnail_storage_path: string | null;
};

type TryonJobRow = {
  id: string;
  product_metadata: unknown;
};

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
};

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
        Image expired or unavailable. Open the web app for a fresh view.
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setOk(false)}
    />
  );
}

async function signTryOnResultUrl(
  sb: ReturnType<typeof createExtensionSupabase>,
  storagePath: string | null,
  thumbPath: string | null,
): Promise<string | null> {
  const main =
    typeof storagePath === "string" && storagePath.trim()
      ? storagePath.trim()
      : null;
  const thumb =
    typeof thumbPath === "string" && thumbPath.trim() ? thumbPath.trim() : null;
  const path = main ?? thumb;
  if (!path) return null;
  const { data, error } = await sb.storage
    .from("tryon-results")
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

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

function CircleEditorialHeader({
  productUrl,
  productName,
  footnote,
}: {
  productUrl?: string;
  productName: string;
  footnote?: string | null;
}) {
  const host = spotlightHostFromUrl(productUrl);
  return (
    <header className="mx-1 mt-1 space-y-3.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
        Spotlight · {host}
      </p>
      <h2 className="font-display text-[38px] font-normal leading-[1] tracking-[-0.02em] text-mirror-text">
        What your <em className="italic">circle</em> thinks.
      </h2>
      <p className="text-[13.5px] leading-[1.55] text-mirror-muted">
        {productName}
      </p>
      {footnote ? (
        <p className="text-[11px] leading-relaxed text-mirror-muted">
          {footnote}
        </p>
      ) : null}
    </header>
  );
}

function CircleSectionEyebrow({ children }: { children: string }) {
  return (
    <p className="mx-1 text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
      {children}
    </p>
  );
}

function hashString32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic demo-only signal for “what your circle thinks” — not live friend data. */
function simulatedCircleScore(fingerprint: string): {
  score: number;
  headline: string;
  blurb: string;
} {
  const key = fingerprint.trim() || "mirror-circle";
  const h = hashString32(key);
  const score = 52 + (h % 43);
  if (score >= 82) {
    return {
      score,
      headline: "Strong buzz",
      blurb:
        "Your circle would green-light this pick—energy matches how they shop.",
    };
  }
  if (score >= 70) {
    return {
      score,
      headline: "Warm reception",
      blurb:
        "Lean-positive signals: friends who share your taste lean toward yes.",
    };
  }
  if (score >= 58) {
    return {
      score,
      headline: "Mixed curiosity",
      blurb: "Split takes—some want to see it on body before they cosign.",
    };
  }
  return {
    score,
    headline: "Soft maybe",
    blurb: "Quiet room - worth trying on or asking one trusted friend first.",
  };
}

function CircleScoreCard({ fingerprint }: { fingerprint: string }) {
  const sim = simulatedCircleScore(fingerprint);
  return (
    <section
      className="mx-1 rounded-card border border-mirror-border bg-mirror-card px-5 py-5"
      aria-label="Circle score simulated preview"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          Circle score
        </span>
      </div>
      <p className="mt-4 text-[12px] leading-snug text-mirror-muted">
        What your circle thinks about this product?
      </p>
      <div className="mt-6 flex items-end gap-2">
        <span className="font-display text-[64px] font-normal leading-[0.85] text-mirror-text">
          {sim.score}
        </span>
        <span className="pb-1 text-[14px] leading-none text-mirror-muted">
          /100
        </span>
      </div>
      <p className="mt-3 font-display text-[17px] font-normal leading-tight text-mirror-text">
        {sim.headline}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-mirror-muted">
        {sim.blurb}
      </p>
      <div
        className="mt-5 h-[6px] overflow-hidden rounded-full bg-mirror-border"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-mirror-text transition-[width] duration-500"
          style={{ width: `${sim.score}%` }}
        />
      </div>
    </section>
  );
}

function CircleRoster({ onManage }: { onManage?: () => void }) {
  const slots = [
    { letter: "A", className: "bg-[#E7E2F7] text-mirror-text" },
    { letter: "M", className: "bg-mirror-text text-white" },
    { letter: "J", className: "bg-[#E7E2F7] text-mirror-text" },
    { letter: "K", className: "bg-mirror-text text-white" },
    { letter: "R", className: "bg-[#E7E2F7] text-mirror-text" },
    { letter: "S", className: "bg-mirror-text text-white" },
  ];

  return (
    <section className="mx-1 mt-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          Your circle · 6
        </p>
        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            className="text-[11px] text-mirror-muted transition-colors duration-150 hover:text-mirror-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
          >
            manage →
          </button>
        ) : (
          <span className="text-[11px] text-mirror-muted">manage →</span>
        )}
      </div>
      <div className="mt-4 flex items-center">
        {slots.map((slot, index) => (
          <div
            key={slot.letter + index}
            className={`-ml-2.5 flex h-10 w-10 items-center justify-center rounded-full border border-mirror-panel text-[11px] font-medium first:ml-0 ${slot.className}`}
          >
            {slot.letter}
          </div>
        ))}
        <button
          type="button"
          className="-ml-2.5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-mirror-muted bg-transparent text-mirror-muted transition-colors duration-150 hover:border-mirror-text hover:text-mirror-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
          aria-label="Invite to your circle"
        >
          <IconPlus className="h-[18px] w-[18px]" />
        </button>
      </div>
    </section>
  );
}

function CircleEmptyState({
  title,
  hint,
  ctaLabel,
  onCta,
}: {
  title: ReactNode;
  hint: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <section className="mx-1 rounded-[22px] border-[1.5px] border-dashed border-mirror-border bg-transparent px-5 py-10 text-center">
      <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-mirror-bg2 text-mirror-ink2">
        <IconCircle className="h-7 w-7" />
      </div>
      <div className="mx-auto mt-7 max-w-[240px] font-display text-[22px] font-normal leading-[1.05] tracking-[-0.01em] text-mirror-text">
        {title}
      </div>
      <p className="mx-auto mt-5 max-w-[250px] text-[13.5px] leading-[1.55] text-mirror-muted">
        {hint}
      </p>
      {ctaLabel && onCta ? (
        <button
          type="button"
          onClick={onCta}
          className="mx-auto mt-7 inline-flex items-center gap-2 rounded-full bg-mirror-text px-6 py-3 text-[14px] font-medium tracking-[0.01em] text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
        >
          <IconSparkleOutline className="h-[14px] w-[14px]" />
          {ctaLabel}
        </button>
      ) : null}
    </section>
  );
}

function CircleSpotlightCard({
  authorInitial,
  authorLabel,
  createdAt,
  imageUrl,
  caption,
  stats,
}: {
  authorInitial: string;
  authorLabel: string;
  createdAt: string;
  imageUrl: string;
  caption: string;
  stats: string;
}) {
  return (
    <article className="mx-1 overflow-hidden rounded-card border border-mirror-border bg-mirror-card">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mirror-text text-[13px] font-medium text-white">
          {authorInitial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-mirror-text">
            {authorLabel}
          </p>
          <p className="text-[11px] text-mirror-muted">{createdAt}</p>
        </div>
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-mirror-bg2">
        <PostImage src={imageUrl} />
      </div>
      <div className="space-y-2 px-4 py-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          This product
        </p>
        <p className="font-display text-[21px] font-normal leading-[1.08] tracking-[-0.01em] text-mirror-text">
          {caption}
        </p>
        <p className="text-[11px] text-mirror-muted">{stats}</p>
      </div>
    </article>
  );
}

export type CircleViewProps = {
  productUrl: string | undefined;
  productName: string | undefined;
  normalizedProductImage: string;
  /** After share-to-feed in this session — drives labeled demo preview. */
  posted?: boolean;
  /** Try-on result image URL for demo hero when spotlight has not resolved yet. */
  lastTryOnImageUrl?: string;
  onGoTryOn?: () => void;
};

export function CircleView({
  productUrl,
  productName,
  normalizedProductImage,
  posted = false,
  lastTryOnImageUrl = "",
  onGoTryOn,
}: CircleViewProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [noPdp, setNoPdp] = useState(false);
  const [spotlightPost, setSpotlightPost] = useState<PostRow | null>(null);
  const [spotlightImageUrl, setSpotlightImageUrl] = useState<string>("");
  const [authorLabel, setAuthorLabel] = useState("You");
  const [authorInitial, setAuthorInitial] = useState("?");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentNames, setCommentNames] = useState<Record<string, string>>({});

  const trimmedUrl = productUrl?.trim() ?? "";
  const labelName = productName?.trim() || "This product";
  const circleScoreFingerprint = trimmedUrl || labelName;
  const demoHeroSrc = lastTryOnImageUrl.trim() || normalizedProductImage.trim();
  const showDemoThread =
    posted && shouldShowDemoFriendThread(posted, comments.length > 0);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setLoadError(null);
      setNoSession(false);
      setNoPdp(false);
      setSpotlightPost(null);
      setSpotlightImageUrl("");
      setComments([]);
      setCommentNames({});

      if (!trimmedUrl) {
        setNoPdp(true);
        setLoading(false);
        return;
      }

      const sb = createExtensionSupabase();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setNoSession(true);
        setLoading(false);
        return;
      }

      const selfLabel = displayNameFromUser(user);
      setAuthorLabel(selfLabel);
      setAuthorInitial(profileInitial(selfLabel));

      const { data: rows, error: postsErr } = await sb
        .from("posts")
        .select(
          "id, caption, image_url, created_at, tryon_result_id, product_id, reaction_count, comment_count",
        )
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(CIRCLE_POST_SCAN);

      if (cancelled) return;
      if (postsErr) {
        setLoadError(postsErr.message);
        setLoading(false);
        return;
      }

      const posts = (rows ?? []) as PostRow[];
      const resultIds = Array.from(
        new Set(
          posts
            .map((p) => p.tryon_result_id)
            .filter(
              (id): id is string => typeof id === "string" && Boolean(id),
            ),
        ),
      );

      if (resultIds.length === 0) {
        setSpotlightPost(null);
        setLoading(false);
        return;
      }

      const { data: results, error: resErr } = await sb
        .from("tryon_results")
        .select("id, job_id, storage_path, thumbnail_storage_path")
        .in("id", resultIds)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (cancelled) return;
      if (resErr || !results?.length) {
        setSpotlightPost(null);
        setLoading(false);
        return;
      }

      const resultRows = results as TryonResultRow[];
      const jobIds = Array.from(
        new Set(resultRows.map((r) => r.job_id).filter(Boolean)),
      );
      const { data: jobs, error: jobErr } = await sb
        .from("tryon_jobs")
        .select("id, product_metadata")
        .in("id", jobIds)
        .eq("user_id", user.id);

      if (cancelled) return;
      if (jobErr || !jobs?.length) {
        setSpotlightPost(null);
        setLoading(false);
        return;
      }

      const jobById = new Map((jobs as TryonJobRow[]).map((j) => [j.id, j]));
      const pageUrlByResultId = new Map<string, string>();
      for (const r of resultRows) {
        const job = jobById.get(r.job_id);
        const page = job
          ? readPageUrlFromProductMetadata(job.product_metadata)
          : null;
        if (page) pageUrlByResultId.set(r.id, page);
      }

      let matched: PostRow | null = null;
      for (const p of posts) {
        if (!p.tryon_result_id) continue;
        const stored = pageUrlByResultId.get(p.tryon_result_id);
        if (stored && urlsMatchForSpotlight(trimmedUrl, stored)) {
          matched = p;
          break;
        }
      }

      if (!matched) {
        setSpotlightPost(null);
        setLoading(false);
        return;
      }

      const matchedResult = resultRows.find(
        (r) => r.id === matched!.tryon_result_id,
      );
      let imageUrl = "";
      if (matchedResult) {
        const signed = await signTryOnResultUrl(
          sb,
          matchedResult.storage_path,
          matchedResult.thumbnail_storage_path,
        );
        if (signed) imageUrl = signed;
      }
      if (
        !imageUrl &&
        typeof matched.image_url === "string" &&
        matched.image_url.trim()
      ) {
        imageUrl = matched.image_url.trim();
      }

      const { data: commentRows, error: cErr } = await sb
        .from("comments")
        .select("id, body, created_at, user_id")
        .eq("post_id", matched.id)
        .is("deleted_at", null)
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: true })
        .limit(COMMENTS_LIMIT);

      if (cancelled) return;
      const list = (cErr ? [] : (commentRows ?? [])) as CommentRow[];
      const uids = Array.from(new Set(list.map((c) => c.user_id)));
      const names: Record<string, string> = {};
      if (uids.length > 0) {
        const { data: profs } = await sb
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", uids);
        for (const row of (profs ?? []) as {
          user_id: string;
          display_name: string;
        }[]) {
          names[row.user_id] = row.display_name?.trim() || "Member";
        }
      }

      if (cancelled) return;
      setSpotlightPost(matched);
      setSpotlightImageUrl(imageUrl);
      setComments(list);
      setCommentNames(names);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [trimmedUrl]);

  const webBase = getMirrorWebBase();

  if (loading) {
    return (
      <div
        className="flex flex-col gap-5 pb-4"
        aria-busy="true"
        aria-live="polite"
      >
        <CircleEditorialHeader
          productUrl={trimmedUrl || undefined}
          productName={labelName}
          footnote={trimmedUrl ? "Tracing posts tied to this page." : null}
        />
        <CircleScoreCard fingerprint={circleScoreFingerprint} />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="space-y-5 py-4">
        <CircleEditorialHeader
          productUrl={trimmedUrl || undefined}
          productName={labelName}
        />
        <CircleScoreCard fingerprint={circleScoreFingerprint} />
        <CircleSectionEyebrow>Posts on this product</CircleSectionEyebrow>
        <CircleEmptyState
          title={
            <>
              Circle is quiet
              <br />
              <em className="italic">for now.</em>
            </>
          }
          hint={loadError}
        />
      </div>
    );
  }
  if (noSession) {
    return (
      <div className="space-y-5 py-4">
        <CircleEditorialHeader
          productName="Circle opens once you’re signed in."
          footnote="Reactions and comments for this product URL live behind your session."
        />
        <CircleScoreCard fingerprint={circleScoreFingerprint} />
        <CircleSectionEyebrow>Posts on this product</CircleSectionEyebrow>
        <CircleEmptyState
          title={
            <>
              No one&apos;s posted
              <br />
              <em className="italic">here yet.</em>
            </>
          }
          hint="Sign in to read or start the thread for this product."
        />
      </div>
    );
  }
  if (noPdp) {
    return (
      <div className="flex flex-col gap-5 py-4">
        <CircleEditorialHeader
          productName="No product on this tab yet."
          footnote="Open a PDP, then come back here for the thread on that item."
        />
        <CircleScoreCard fingerprint={circleScoreFingerprint} />
        <CircleSectionEyebrow>Posts on this product</CircleSectionEyebrow>
        <CircleEmptyState
          title={
            <>
              Nothing to review
              <br />
              <em className="italic">just yet.</em>
            </>
          }
          hint="Open a product page, then Circle will spotlight reactions for that exact item."
        />
      </div>
    );
  }

  const showDemoPreview = !spotlightPost && posted && Boolean(demoHeroSrc);
  const showEmptyState = !spotlightPost && !showDemoPreview;
  const manageCircle = webBase ? () => openMirrorWebPath("/feed") : undefined;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CircleEditorialHeader productUrl={trimmedUrl} productName={labelName} />
      <CircleScoreCard fingerprint={circleScoreFingerprint} />
      <CircleSectionEyebrow>Posts on this product</CircleSectionEyebrow>

      {showDemoPreview ? (
        <div className="flex flex-col gap-3">
          <p className="mx-1 text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-accent">
            Demo preview
          </p>
          <CircleSpotlightCard
            authorInitial={authorInitial}
            authorLabel={authorLabel}
            createdAt="Just now"
            imageUrl={demoHeroSrc}
            caption={`Fit check: ${labelName}`.slice(0, 90)}
            stats="Linking this try-on to the product page."
          />
          <div className="mx-1">
            <DemoSocialStrip />
          </div>
        </div>
      ) : null}

      {showEmptyState ? (
        <CircleEmptyState
          title={
            <>
              No one&apos;s posted
              <br />
              <em className="italic">here yet.</em>
            </>
          }
          hint="Try it on and share to start the thread."
          ctaLabel="Be first"
          onCta={onGoTryOn}
        />
      ) : null}

      {spotlightPost ? (
        <div className="flex flex-col gap-3">
          <CircleSpotlightCard
            authorInitial={authorInitial}
            authorLabel={authorLabel}
            createdAt={new Date(spotlightPost.created_at).toLocaleString()}
            imageUrl={spotlightImageUrl}
            caption={spotlightPost.caption ?? "Fit check"}
            stats={`${spotlightPost.reaction_count} reaction${spotlightPost.reaction_count === 1 ? "" : "s"} · ${spotlightPost.comment_count} comment${spotlightPost.comment_count === 1 ? "" : "s"}`}
          />

          {showDemoThread ? (
            <div className="mx-1">
              <DemoSocialStrip showSectionTitle />
            </div>
          ) : comments.length === 0 ? (
            <CircleEmptyState
              title={
                <>
                  No comments
                  <br />
                  <em className="italic">yet.</em>
                </>
              }
              hint="Share your try-on to start the thread around this product."
              ctaLabel="Open Try-on"
              onCta={onGoTryOn}
            />
          ) : (
            <ul className="mx-1 flex flex-col gap-2.5">
              {comments.map((c) => {
                const who = commentNames[c.user_id] ?? "Member";
                return (
                  <li
                    key={c.id}
                    className="rounded-card border border-mirror-border bg-mirror-card px-4 py-3.5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
                        {who}
                      </p>
                      <p className="shrink-0 text-[10px] text-mirror-muted">
                        {new Date(c.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="mt-3 text-[13.5px] leading-[1.55] text-mirror-ink2">
                      {c.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <CircleRoster onManage={manageCircle} />
    </div>
  );
}

import {
  submitReverseSearch,
  waitForReverseSearchJob,
  type MirrorPostMatch,
  type WebVisualMatch,
} from "@mirror/sdk-js";
import { useEffect, useRef, useState } from "react";
import { createExtensionSupabase } from "../../lib/supabase";
import { IconHeart, IconMessage, IconWornBy } from "../icons";
import { WornByCardModal, type WornByCardSource } from "./WornByCardModal";

type MirrorPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; mirror: MirrorPostMatch[] }
  | { kind: "error"; message: string };

type WebPhase =
  | { kind: "idle" }
  | { kind: "disabled" }
  | { kind: "loading" }
  | { kind: "result"; matches: WebVisualMatch[] }
  | { kind: "error"; message: string };

type WornByViewProps = {
  productUrl: string | undefined;
  productName: string;
  apiBase: string;
  /** From Home strip tap; must be >0 (or fetchToken > 0) before reverse search runs. */
  fetchNonce: number;
  /** PDP metadata scraped by the content script — forwarded to the backend
   *  so the `products` row is upserted before the worker runs. Without this
   *  the worker's primary_image_url lookup returns null and providers
   *  short-circuit with zero results. */
  productExtracted?: {
    name?: string;
    image?: string;
    brand?: string;
    price?: number;
    category?: string;
  };
  /** Callback: start the try-on flow using the PRODUCT image (hard rule #1). */
  onTryOnProduct?: () => void;
  /** Disables the modal's Try-on CTA (e.g. when no product image is detected). */
  tryOnDisabled?: boolean;
  /** Reports {mirror_count, web_count, canonical_url_hash} to the parent so the
   *  Home strip can show a persistent count without refetching. */
  onResultsChange?: (n: {
    mirror_count: number;
    web_count: number;
    canonical_url_hash?: string;
  }) => void;
};

const SLOW_FETCH_NOTICE_MS = 15_000;

function CardImage({ src, alt }: { src: string; alt: string }) {
  const [ok, setOk] = useState(true);
  if (!src.trim() || !ok) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-mirror-border/40 text-[10px] text-mirror-muted">
        No image
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      onError={() => setOk(false)}
    />
  );
}

function SourceChip({
  label,
  faviconUrl,
}: {
  label: string;
  faviconUrl?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-mirror-bg2 px-1.5 py-[2px] text-[9.5px] font-medium uppercase tracking-[0.1em] text-mirror-ink2">
      {faviconUrl ? (
        <img src={faviconUrl} alt="" className="h-3 w-3 rounded-sm" />
      ) : null}
      {label}
    </span>
  );
}

function prettyHost(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h.includes("pinterest")) return "Pinterest";
  if (h.includes("instagram")) return "Instagram";
  if (h.includes("tiktok")) return "TikTok";
  return h || "Web";
}

function faviconFor(host: string): string | undefined {
  const h = host.trim().replace(/^www\./, "");
  if (!h) return undefined;
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(h)}`;
}

function MirrorCard({
  post,
  productName,
  onOpen,
}: {
  post: MirrorPostMatch;
  productName: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-tile border border-mirror-border bg-mirror-card text-left transition-colors hover:border-mirror-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
    >
      <div className="aspect-[3/4] w-full overflow-hidden">
        <CardImage
          src={post.thumbnail_url ?? post.image_url}
          alt={post.caption || `Mirror user wearing ${productName}`}
        />
      </div>
      <div className="flex flex-col gap-1 px-3 py-2.5">
        <SourceChip label="Mirror user" />
        {post.caption ? (
          <p className="line-clamp-2 font-display text-[13px] leading-[1.35] text-mirror-text">
            {post.caption}
          </p>
        ) : null}
        <div className="flex items-center gap-3 text-[11px] text-mirror-muted">
          <span className="inline-flex items-center gap-1">
            <IconHeart /> {post.reaction_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <IconMessage /> {post.comment_count}
          </span>
        </div>
      </div>
    </button>
  );
}

function WebCard({
  match,
  onOpen,
}: {
  match: WebVisualMatch;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-tile border border-mirror-border bg-mirror-card text-left transition-colors hover:border-mirror-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
    >
      <div className="aspect-[3/4] w-full overflow-hidden">
        <CardImage
          src={match.image_url}
          alt={match.title || `Real person wearing similar item from ${match.source_host}`}
        />
      </div>
      <div className="flex flex-col gap-1 px-3 py-2">
        <SourceChip
          label={prettyHost(match.source_host)}
          faviconUrl={faviconFor(match.source_host)}
        />
        {match.title ? (
          <p className="line-clamp-2 font-display text-[12px] leading-[1.3] text-mirror-text">
            {match.title}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="aspect-[3/4] animate-pulse rounded-tile bg-mirror-border/40"
        />
      ))}
    </div>
  );
}

export function WornByView({
  productUrl,
  productName,
  apiBase,
  fetchNonce,
  productExtracted,
  onTryOnProduct,
  tryOnDisabled,
  onResultsChange,
}: WornByViewProps) {
  const [mirror, setMirror] = useState<MirrorPhase>({ kind: "idle" });
  const [web, setWeb] = useState<WebPhase>({ kind: "idle" });
  /** Bump to re-run reverse search (same PDP) — e.g. Retry after worker catches up. */
  const [fetchToken, setFetchToken] = useState(0);
  const [modalSource, setModalSource] = useState<WornByCardSource | null>(null);
  /** true once `waitForReverseSearchJob` has been running long enough to show
   *  an inline "taking longer than usual" note (so the user knows the worker
   *  is still processing; 15 s matches typical p95 for composite + filter). */
  const [slowWebFetch, setSlowWebFetch] = useState(false);
  const slowTimerRef = useRef<number | null>(null);
  /**
   * Parent (App.tsx) passes `onResultsChange` and `productExtracted` inline —
   * new identities on every render. Putting them in the effect dep array
   * would cause the fetch to re-fire every App re-render → infinite loop.
   * Keep the latest values in refs so the effect only depends on real inputs
   * (PDP, apiBase, fetch nonces).
   */
  const onResultsChangeRef = useRef(onResultsChange);
  useEffect(() => {
    onResultsChangeRef.current = onResultsChange;
  }, [onResultsChange]);
  const productExtractedRef = useRef(productExtracted);
  useEffect(() => {
    productExtractedRef.current = productExtracted;
  }, [productExtracted]);

  useEffect(() => {
    if (!productUrl || !productUrl.trim()) {
      setMirror({ kind: "idle" });
      setWeb({ kind: "idle" });
      setSlowWebFetch(false);
      return;
    }
    const userRequestedFetch = fetchNonce > 0 || fetchToken > 0;
    if (!userRequestedFetch) {
      setMirror({ kind: "idle" });
      setWeb({ kind: "idle" });
      setSlowWebFetch(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setMirror({ kind: "loading" });
      setWeb({ kind: "loading" });
      setSlowWebFetch(false);
      const sb = createExtensionSupabase();
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (!cancelled) {
            setMirror({
              kind: "error",
              message: "Sign in to see who's wearing this.",
            });
            setWeb({ kind: "idle" });
          }
          return;
        }
        const res = await submitReverseSearch(apiBase, token, {
          url: productUrl,
          extracted: productExtractedRef.current,
        });
        if (cancelled) return;
        const mirrorResults = res.mirror_results ?? [];
        setMirror({ kind: "result", mirror: mirrorResults });

        if (res.external_disabled) {
          setWeb({ kind: "disabled" });
          onResultsChangeRef.current?.({
            mirror_count: mirrorResults.length,
            web_count: 0,
            canonical_url_hash: res.canonical_url_hash,
          });
          return;
        }
        if (res.cache_hit) {
          const matches = res.web_results ?? [];
          setWeb({ kind: "result", matches });
          onResultsChangeRef.current?.({
            mirror_count: mirrorResults.length,
            web_count: matches.length,
            canonical_url_hash: res.canonical_url_hash,
          });
          return;
        }
        if (res.job_id) {
          // Fire the slow-notice timer so the user knows we're still working
          // even when the worker is mid-composite-fan-out.
          slowTimerRef.current = window.setTimeout(() => {
            if (!cancelled) setSlowWebFetch(true);
          }, SLOW_FETCH_NOTICE_MS);
          try {
            const done = await waitForReverseSearchJob(
              sb,
              apiBase,
              token,
              res.job_id,
              { timeoutMs: 120_000 },
            );
            if (cancelled) return;
            if (done.status === "completed") {
              const matches = (done.web_results ?? []) as WebVisualMatch[];
              setWeb({ kind: "result", matches });
              onResultsChangeRef.current?.({
                mirror_count: mirrorResults.length,
                web_count: matches.length,
                canonical_url_hash: res.canonical_url_hash,
              });
            } else {
              setWeb({
                kind: "error",
                message:
                  done.error_message ??
                  (done.error_code
                    ? `Search failed (${done.error_code})`
                    : "Search failed."),
              });
            }
          } catch (e) {
            if (!cancelled)
              setWeb({
                kind: "error",
                message: e instanceof Error ? e.message : "Search timed out.",
              });
          } finally {
            if (slowTimerRef.current != null) {
              window.clearTimeout(slowTimerRef.current);
              slowTimerRef.current = null;
            }
            if (!cancelled) setSlowWebFetch(false);
          }
          return;
        }
        // Defensive: neither cache_hit, nor disabled, nor job_id. Treat as empty.
        setWeb({ kind: "result", matches: [] });
        onResultsChangeRef.current?.({
          mirror_count: mirrorResults.length,
          web_count: 0,
          canonical_url_hash: res.canonical_url_hash,
        });
      } catch (e) {
        if (!cancelled) {
          setMirror({
            kind: "error",
            message: e instanceof Error ? e.message : "Could not load.",
          });
          setWeb({ kind: "idle" });
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (slowTimerRef.current != null) {
        window.clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
    };
    // `onResultsChange` deliberately omitted — read via ref (see onResultsChangeRef).
  }, [productUrl, apiBase, fetchToken, fetchNonce]);

  const productUrlTrimmed = productUrl?.trim() ?? "";
  const userRequestedFetch = fetchNonce > 0 || fetchToken > 0;

  const openMirrorCard = (p: MirrorPostMatch) =>
    setModalSource({
      kind: "mirror",
      imageUrl: p.image_url,
      caption: p.caption,
      authorLabel: "Mirror user",
      reactionCount: p.reaction_count,
      commentCount: p.comment_count,
    });

  const openWebCard = (m: WebVisualMatch) =>
    setModalSource({
      kind: "web",
      imageUrl: m.image_url,
      sourceUrl: m.source_url,
      sourceHost: m.source_host,
      title: m.title,
    });

  return (
    <section className="flex flex-col gap-4 px-4 py-4">
      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mirror-card">
          <IconWornBy />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-[20px] leading-tight text-mirror-text">
            Worn by
          </h2>
          <p className="truncate text-[12px] text-mirror-muted">
            Real people wearing {productName || "this piece"}
          </p>
        </div>
      </header>

      {/* Mirror users section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-[13px] uppercase tracking-[0.12em] text-mirror-muted">
            Mirror users
          </h3>
          {mirror.kind === "result" ? (
            <span className="text-[11px] text-mirror-muted">
              {mirror.mirror.length}{" "}
              {mirror.mirror.length === 1 ? "post" : "posts"}
            </span>
          ) : null}
        </div>

        {mirror.kind === "idle" && !productUrlTrimmed ? (
          <EmptyState
            title="Open a product page"
            body="Reverse search matches against the PDP you're viewing."
          />
        ) : null}

        {mirror.kind === "idle" &&
        productUrlTrimmed &&
        !userRequestedFetch ? (
          <EmptyState
            title="Ready when you are"
            body="Tap Check who's worn this on Home, or search from here."
            actionLabel="Search now"
            onAction={() => setFetchToken((t) => t + 1)}
          />
        ) : null}

        {mirror.kind === "loading" ? <Skeleton count={4} /> : null}

        {mirror.kind === "error" ? (
          <EmptyState
            title="Couldn't load"
            body={mirror.message}
            actionLabel="Retry"
            onAction={() => setFetchToken((t) => t + 1)}
          />
        ) : null}

        {mirror.kind === "result" && mirror.mirror.length === 0 ? (
          <EmptyState
            title="No one we can find is wearing this yet"
            body="When someone in Mirror tries it on and shares, they'll appear here."
          />
        ) : null}

        {mirror.kind === "result" && mirror.mirror.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {mirror.mirror.map((p) => (
              <MirrorCard
                key={p.post_id}
                post={p}
                productName={productName}
                onOpen={() => openMirrorCard(p)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Around-the-web section */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[13px] uppercase tracking-[0.12em] text-mirror-muted">
              Around the web
            </h3>
            {web.kind === "result" ? (
              <span className="text-[11px] text-mirror-muted">
                {web.matches.length}{" "}
                {web.matches.length === 1 ? "match" : "matches"}
              </span>
            ) : null}
          </div>
          <p className="text-[10px] leading-snug text-mirror-muted">
            Sourced from Pinterest, Instagram &amp; the web when your API is configured for composite search.
          </p>
        </div>

        {web.kind === "disabled" ? (
          <EmptyState
            title="External search off"
            body="Set VISUAL_SEARCH_PROVIDER=composite with APIFY_API_TOKEN and SERPAPI_API_KEY (and run mirror-reverse-search-worker), or use serpapi-only mode."
          />
        ) : null}

        {web.kind === "loading" ? (
          <div className="flex flex-col gap-2">
            <Skeleton count={6} />
            {slowWebFetch ? (
              <p className="rounded-tile border border-dashed border-mirror-border bg-mirror-card/60 px-3 py-2 text-center text-[11px] leading-snug text-mirror-muted">
                Still looking around the web. Composite search typically takes
                10–25s on a cold cache — your results will appear here.
              </p>
            ) : null}
          </div>
        ) : null}

        {web.kind === "error" ? (
          <EmptyState
            title="Couldn't load outside photos"
            body={web.message}
            actionLabel="Retry"
            onAction={() => setFetchToken((t) => t + 1)}
          />
        ) : null}

        {web.kind === "result" && web.matches.length === 0 ? (
          <EmptyState
            title="No web matches yet"
            body="Provider returned no visual matches for this product image."
            actionLabel="Retry"
            onAction={() => setFetchToken((t) => t + 1)}
          />
        ) : null}

        {web.kind === "result" && web.matches.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {web.matches.map((m) => (
              <WebCard
                key={`${m.source_url}:${m.image_url}`}
                match={m}
                onOpen={() => openWebCard(m)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <WornByCardModal
        source={modalSource}
        productName={productName}
        onClose={() => setModalSource(null)}
        onTryOnProduct={() => {
          onTryOnProduct?.();
          setModalSource(null);
        }}
        tryOnDisabled={tryOnDisabled}
      />
    </section>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-tile border border-dashed border-mirror-border bg-mirror-card/60 px-4 py-6 text-center">
      <p className="font-display text-[14px] leading-tight text-mirror-text">
        {title}
      </p>
      <p className="mt-1 text-[11px] text-mirror-muted">{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-mirror-text px-6 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

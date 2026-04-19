"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteClosetItem,
  type ClosetDeleteSource,
} from "@/app/(app)/closet/actions";
import { MirrorConfirmDialog } from "@/components/mirror/MirrorConfirmDialog";
import { GenerateVideoCard } from "@/components/mirror/closet/GenerateVideoCard";
import { Btn, Card, Eyebrow } from "@/components/mirror/primitives";

export type ClosetDetailViewModel = {
  source: ClosetDeleteSource;
  id: string;
  name: string;
  brand: string;
  category: "top" | "bottom";
  priceLabel: string | null;
  pageUrl: string | null;
  retailerLabel: string | null;
  imageUrl: string | null;
  /** Signed URL for the Veo-generated MP4, when one has been pre-seeded for
   *  this try-on. Server signs from `tryon_results.video_storage_path`. */
  videoUrl: string | null;
  /** Auth user id — used by `<GenerateVideoCard>` to insert into
   *  `tryon_video_jobs` (which RLS-checks `user_id = auth.uid()`). */
  userId: string;
  /** The underlying `tryon_results.id` (only relevant for `source = "tried"`).
   *  Null on wishlist/owned where no try-on exists yet. */
  tryonResultId: string | null;
  confidenceLabel: string | null;
  generatedAt: string | null;
  post: {
    id: string;
    reactionCount: number;
    commentCount: number;
    caption: string | null;
  } | null;
  recentComments: { body: string; createdAt: string }[];
};

function statusEyebrow(source: ClosetDeleteSource): string {
  if (source === "tried") return "TRIED";
  if (source === "wishlist") return "SAVED";
  return "OWNED";
}

function statusBadge(source: ClosetDeleteSource): {
  label: string;
  variant: "accent" | "ink" | "sage";
} {
  if (source === "tried") return { label: "FRESH", variant: "accent" };
  if (source === "wishlist") return { label: "SAVED", variant: "ink" };
  return { label: "OWNED", variant: "sage" };
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5M11 5l-7 7 7 7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
    </svg>
  );
}

export function ClosetDetailClient({
  detail,
}: {
  detail: ClosetDetailViewModel;
}) {
  const router = useRouter();
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const deleteDescription =
    detail.source === "tried"
      ? "This removes the try-on from My Closet. You can run a new try-on from a product page anytime."
      : detail.source === "owned"
        ? "This removes the owned item from My Closet. You can mark it again from the extension on the product page."
        : "This removes the saved item from My Closet. You can save it again from the extension.";

  const handleDeleteClick = (): void => {
    setError(null);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = (): void => {
    setError(null);
    setDeleteSubmitting(true);
    void (async () => {
      try {
        const res = await deleteClosetItem(detail.source, detail.id);
        if (!res.ok) {
          setError(res.error);
          setDeleteConfirmOpen(false);
          return;
        }
        setDeleteConfirmOpen(false);
        router.push("/closet");
        router.refresh();
      } finally {
        setDeleteSubmitting(false);
      }
    })();
  };

  const badge = statusBadge(detail.source);
  const phVariant =
    detail.source === "wishlist" ? "lav" : detail.source === "owned" ? "sage" : "peach";

  return (
    <div className="page-enter w-full max-w-none px-3 py-6 md:px-4 md:py-8">
      <MirrorConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Remove from closet?"
        description={deleteDescription}
        pending={deleteSubmitting}
        onConfirm={confirmDelete}
      />

      <Link
        href="/closet"
        className="mb-2.5 inline-flex items-center gap-1.5 text-[12px] text-ink3 hover:text-ink"
      >
        <ArrowLeftIcon /> Back to My Closet
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <Eyebrow>
          CLOSET · {statusEyebrow(detail.source)} ·{" "}
          {detail.category === "top" ? "TOPS" : "BOTTOMS"}
        </Eyebrow>
        <Btn variant="ghost" size="sm" onClick={handleDeleteClick} disabled={deleteSubmitting}>
          <TrashIcon /> Remove
        </Btn>
      </div>

      {error ? (
        <p
          className="mb-4 rounded-mirror border border-danger/40 bg-rose-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Hero image */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-[16px] border border-hair">
          {detail.imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.imageUrl}
                alt=""
                className="h-full w-full object-cover object-top"
              />
              <span className={`ph-badge ph-badge-${badge.variant}`}>
                {badge.label}
              </span>
              <div className="ph-cap ph-cap-center">TRY-ON · GENERATED</div>
            </>
          ) : (
            <div className={`ph absolute inset-0 ph-${phVariant} !rounded-none !border-0`}>
              <span className={`ph-badge ph-badge-${badge.variant}`}>
                {badge.label}
              </span>
              <div className="ph-cap ph-cap-center">TRY-ON · GENERATED</div>
            </div>
          )}
        </div>

        {/* Right stack */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="display-lg m-0 text-ink" style={{ fontSize: 40 }}>
              {detail.name}
            </h1>
            <p className="meta mt-1.5">{detail.brand}</p>
          </div>

          {/* Hairline stat grid */}
          <div className="grid-hair" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Eyebrow>RETAILER</Eyebrow>
              <div
                className="display-metric mt-1.5"
                style={{ fontSize: 18, color: detail.pageUrl ? "var(--ink)" : "var(--ink-3)" }}
              >
                {detail.pageUrl ? (
                  <a
                    href={detail.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="border-b border-ink"
                  >
                    {detail.retailerLabel ?? new URL(detail.pageUrl).hostname}
                  </a>
                ) : (
                  detail.retailerLabel ?? "—"
                )}
              </div>
            </div>
            <div>
              <Eyebrow>PRICE</Eyebrow>
              <div
                className="display-metric mt-1.5"
                style={{ color: detail.priceLabel ? "var(--ink)" : "var(--ink-3)" }}
              >
                {detail.priceLabel ?? "—"}
              </div>
            </div>
            <div>
              <Eyebrow>FIT SCORE</Eyebrow>
              <div
                className="display-metric mt-1.5"
                style={{ color: detail.confidenceLabel ? "var(--ink)" : "var(--ink-3)" }}
              >
                {detail.confidenceLabel ?? "—"}
              </div>
            </div>
            <div>
              <Eyebrow>DATE</Eyebrow>
              <div
                className="display-metric mt-1.5"
                style={{ fontSize: 18, color: detail.generatedAt ? "var(--ink)" : "var(--ink-3)" }}
              >
                {detail.generatedAt
                  ? new Date(detail.generatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </div>
            </div>
          </div>

          {/* Friends & feed */}
          <Card>
            <Eyebrow className="mb-2">FRIENDS &amp; FEED</Eyebrow>
            {detail.post ? (
              <div className="space-y-2 text-[13px] text-ink2">
                <p>
                  <span className="font-medium text-ink">
                    {detail.post.reactionCount}
                  </span>{" "}
                  reactions ·{" "}
                  <span className="font-medium text-ink">
                    {detail.post.commentCount}
                  </span>{" "}
                  comments
                </p>
                {detail.post.caption ? (
                  <p className="text-ink3">
                    <span className="font-medium text-ink2">Caption:</span>{" "}
                    {detail.post.caption}
                  </p>
                ) : null}
                {detail.recentComments.length > 0 ? (
                  <ul className="space-y-2 border-t border-hair pt-3">
                    {detail.recentComments.map((c, i) => (
                      <li
                        key={`${i}-${c.createdAt}`}
                        className="text-[12px] leading-relaxed text-ink2"
                      >
                        {c.body}
                        <span className="meta mt-0.5 block">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">No approved comments yet.</p>
                )}
              </div>
            ) : detail.source === "owned" ? (
              <p className="body-sm text-ink2">
                Owned items don&apos;t have a try-on feed card unless you also
                try on and share this product.
              </p>
            ) : (
              <p className="body-sm text-ink2">
                Not posted to your feed yet. Share this try-on from the Mirror
                extension to collect reactions and comments here.
              </p>
            )}
            <div className="mt-3.5">
              <Btn variant="ink" size="sm" disabled={detail.source === "owned"}>
                <ShareIcon /> Share to feed
              </Btn>
            </div>
          </Card>

          {/* Swap garment */}
          <Card>
            <Eyebrow className="mb-2">
              SWAP GARMENT
              <span
                className="ml-1.5 text-[12px] text-accent"
                style={{
                  fontFamily: "var(--font-instrument), ui-serif, Georgia, serif",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontStyle: "italic",
                }}
              >
                · regenerate
              </span>
            </Eyebrow>
            <p className="body-sm text-ink2">
              Run a new try-on from the store page or extension with a different
              item. Picking another garment from this closet to swap in will
              ship after the hackathon.
            </p>
            <div className="mt-3.5">
              <button
                disabled
                className="cursor-not-allowed rounded-full border border-hair px-3 py-1.5 text-[12px] font-medium text-ink3"
              >
                Swap from closet (coming soon)
              </button>
            </div>
          </Card>

          {/* Generate video — interactive on `tried` rows (real try-on result
              we can feed Veo). Wishlist/owned have no try-on yet, so the
              card stays as a placeholder. */}
          {detail.tryonResultId ? (
            <GenerateVideoCard
              tryonResultId={detail.tryonResultId}
              userId={detail.userId}
              initialVideoUrl={detail.videoUrl}
              posterUrl={detail.imageUrl}
            />
          ) : (
            <Card>
              <Eyebrow className="mb-2">GENERATE VIDEO</Eyebrow>
              <p className="body-sm text-ink2">
                Try this on first to enable video generation.
              </p>
              <div className="mt-3.5">
                <Btn variant="accent" size="sm" disabled>
                  <SparkleIcon /> Generate video
                </Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

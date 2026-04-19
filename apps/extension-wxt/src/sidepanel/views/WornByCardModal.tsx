import { useEffect } from "react";
import { IconClose, IconSparkleOutline } from "../icons";

/**
 * Card detail modal for the Worn by tab.
 *
 * Crucially: the "Try this on me" CTA always uses the **product** URL/image
 * (passed in from App state), NEVER the web photo the user is looking at
 * (CLAUDE.md hard rule #1 — biometric safety applies to reference photos,
 * and we must not promote a random web photo into the try-on pipeline).
 */

export type WornByCardSource =
  | {
      kind: "mirror";
      imageUrl: string;
      caption: string;
      authorLabel: string;
      reactionCount: number;
      commentCount: number;
    }
  | {
      kind: "web";
      imageUrl: string;
      sourceUrl: string;
      sourceHost: string;
      title: string;
    };

type WornByCardModalProps = {
  source: WornByCardSource | null;
  productName: string;
  onClose: () => void;
  onTryOnProduct: () => void;
  tryOnDisabled?: boolean;
};

function hostChip(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h.includes("pinterest")) return "Pinterest";
  if (h.includes("instagram")) return "Instagram";
  if (h.includes("tiktok")) return "TikTok";
  return h || "Web";
}

export function WornByCardModal({
  source,
  productName,
  onClose,
  onTryOnProduct,
  tryOnDisabled,
}: WornByCardModalProps) {
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, onClose]);

  if (!source) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Worn by — photo detail"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[440px] flex-col overflow-hidden rounded-card bg-mirror-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
            {source.kind === "mirror" ? "Mirror user" : hostChip(source.sourceHost)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-mirror-muted transition-colors hover:bg-mirror-bg2 hover:text-mirror-text"
          >
            <IconClose />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-mirror-bg2">
          <img
            src={source.imageUrl}
            alt={
              source.kind === "mirror"
                ? source.caption || `Mirror user wearing ${productName}`
                : source.title || `Real person wearing similar item from ${source.sourceHost}`
            }
            className="h-full max-h-[60vh] w-full object-contain"
          />
        </div>

        <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
          {source.kind === "mirror" ? (
            <>
              {source.caption ? (
                <p className="font-display text-[14px] leading-snug text-mirror-text">
                  {source.caption}
                </p>
              ) : null}
              <p className="text-[11px] text-mirror-muted">
                {source.authorLabel} · {source.reactionCount}{" "}
                {source.reactionCount === 1 ? "reaction" : "reactions"} ·{" "}
                {source.commentCount}{" "}
                {source.commentCount === 1 ? "comment" : "comments"}
              </p>
            </>
          ) : (
            <>
              {source.title ? (
                <p className="font-display text-[14px] leading-snug text-mirror-text">
                  {source.title}
                </p>
              ) : null}
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate text-[11px] text-mirror-muted underline decoration-mirror-border underline-offset-4 hover:text-mirror-text"
              >
                {source.sourceHost} ↗
              </a>
            </>
          )}

          <button
            type="button"
            onClick={onTryOnProduct}
            disabled={tryOnDisabled}
            className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-mirror-text px-4 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconSparkleOutline />
            Try this on me
          </button>
          <p className="px-1 text-center text-[10px] leading-snug text-mirror-muted">
            Uses the product image, not the photo above — your reference photo stays private.
          </p>
        </div>
      </div>
    </div>
  );
}

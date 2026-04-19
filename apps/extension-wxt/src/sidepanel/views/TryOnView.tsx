import { useEffect, useState } from "react";
import { IconCamera } from "../icons";
import type { TryOnPhase } from "../confidence/ConfidenceSignals";
import type { ReferenceStatus } from "../types";

export type GarmentCategory = "top" | "bottom";

export type GarmentListFilter = GarmentCategory | "this_page";

export type SavedGarment = {
  closetItemId: string;
  productId: string;
  name: string;
  brand: string | null;
  imageUrl: string;
  bucket: GarmentCategory;
  priceUsd: number | null;
};

export type PdpGarmentPreview = {
  imageUrl: string;
  name: string;
  brand: string | undefined;
  category: GarmentCategory;
  pageUrl: string;
  price: number | undefined;
};

type TryOnViewProps = {
  phase: TryOnPhase;
  resultUrl: string | null;
  error: string | null;
  referenceStatus: ReferenceStatus;
  /** Signed URL: prior try-on preview when user picked a generated look as model, else biometric reference. */
  avatarTileDisplayUrl: string | null;
  savedGarments: SavedGarment[];
  savedLoading: boolean;
  savedError: string | null;
  listFilter: GarmentListFilter;
  onListFilterChange: (filter: GarmentListFilter) => void;
  hasProductImage: boolean;
  productLabel: string;
  pdpGarment: PdpGarmentPreview | null;
  onSelectThisPageGarment: () => void;
  selectedTop: SavedGarment | null;
  selectedBottom: SavedGarment | null;
  activeGarment: GarmentCategory;
  onActiveGarmentChange: (slot: GarmentCategory) => void;
  onSelectSavedGarment: (garment: SavedGarment) => void;
  onClearSlot: (slot: GarmentCategory) => void;
  pdpGarmentCategory: GarmentCategory;
  onPdpGarmentCategoryChange: (category: GarmentCategory) => void;
  recentModelPicks: { id: string; thumbUrl: string }[];
  referenceModelOverrideActive: boolean;
  onPickReferenceModel: (id: string) => void | Promise<void>;
  onClearReferenceModel: () => void;
  onRunTryOn: () => void;
  onRegenerate: () => void;
  /** Gemini editorial polish of the current primary try-on (optional). */
  onEditorialPose?: () => void;
  editorialBusy?: boolean;
  /** Show editorial CTA only when a primary FASHN result exists (parent App tracks id). */
  showEditorialCta?: boolean;
  onShareToFeed: () => void;
  posted: boolean;
  generateDisabled: boolean;
  regenerateDisabled: boolean;
};

function slotButtonClass(active: boolean): string {
  return `relative flex aspect-square w-full max-w-[72px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border-2 bg-mirror-bg2 transition-colors ${
    active
      ? "border-mirror-text"
      : "border-mirror-border hover:border-mirror-ink2/40"
  }`;
}

function avatarSlotClass(): string {
  return `relative flex aspect-square w-full max-w-[72px] flex-1 items-center justify-center overflow-hidden rounded-[12px] border-2 border-mirror-border bg-mirror-bg2 transition-colors hover:border-mirror-ink2/40`;
}

export function TryOnView({
  phase,
  resultUrl,
  error,
  referenceStatus,
  avatarTileDisplayUrl,
  savedGarments,
  savedLoading,
  savedError,
  listFilter,
  onListFilterChange,
  hasProductImage,
  productLabel,
  pdpGarment,
  onSelectThisPageGarment,
  selectedTop,
  selectedBottom,
  activeGarment,
  onActiveGarmentChange,
  onSelectSavedGarment,
  onClearSlot,
  pdpGarmentCategory,
  onPdpGarmentCategoryChange,
  recentModelPicks,
  referenceModelOverrideActive,
  onPickReferenceModel,
  onClearReferenceModel,
  onRunTryOn,
  onRegenerate,
  onEditorialPose,
  editorialBusy = false,
  showEditorialCta = false,
  onShareToFeed,
  posted,
  generateDisabled,
  regenerateDisabled,
}: TryOnViewProps) {
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  /** Prefer any saved try-on image URL; do not require `phase === "result"` so a failed Regenerate (`phase === "error"`) still shows the last image and editorial updates. */
  const showResult = Boolean(resultUrl);
  const heroModelUrl = resultUrl ?? avatarTileDisplayUrl ?? null;
  const topTileSrc =
    selectedTop?.imageUrl ??
    (pdpGarment?.category === "top" ? pdpGarment.imageUrl : null);
  const bottomTileSrc =
    selectedBottom?.imageUrl ??
    (pdpGarment?.category === "bottom" ? pdpGarment.imageUrl : null);

  const filtered =
    listFilter === "this_page"
      ? []
      : savedGarments.filter((g) => g.bucket === listFilter);
  const showRegenerate = Boolean(resultUrl);

  const heroLightboxUrl = heroModelUrl;
  const canOpenHeroLightbox =
    Boolean(heroLightboxUrl) && phase !== "loading" && !editorialBusy;

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  return (
    <div className="flex flex-col gap-3 pb-4">
      <section className="relative overflow-hidden rounded-card border border-mirror-border bg-mirror-panel px-5 py-5 text-center">
        <div className="relative mx-auto aspect-[3/4] w-full max-w-[210px] max-h-[320px] overflow-hidden rounded-[14px] bg-mirror-panel">
          {resultUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- extension panel
            <img
              key={resultUrl}
              src={resultUrl}
              alt="Try-on result"
              className="absolute inset-0 h-full w-full rounded-[16px] object-contain object-center"
            />
          ) : heroModelUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroModelUrl}
              alt=""
              className="absolute inset-0 h-full w-full rounded-[16px] object-contain object-center"
            />
          ) : (
            /* Diagonal-striped placeholder — no illustrative SVG (design guide) */
            <div
              className="absolute inset-0 flex flex-col items-center justify-end rounded-[16px] pb-4"
              style={{
                background:
                  "repeating-linear-gradient(135deg, #D9D4CB 0px, #D9D4CB 6px, #CFC9BE 6px, #CFC9BE 12px)",
              }}
            >
              <span className="rounded bg-mirror-panel/85 px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-mirror-muted">
                Preview
              </span>
            </div>
          )}
          {phase === "loading" || editorialBusy ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden rounded-[16px]"
              aria-busy
              aria-label={
                editorialBusy ? "Enhancing photo" : "Generating try-on"
              }
            >
              <div className="absolute inset-0 bg-mirror-panel/75 backdrop-blur-[6px]" />
              <div className="relative z-[1] flex flex-col items-center gap-3">
                <div
                  className="h-7 w-7 shrink-0 rounded-full border-2 border-mirror-border border-t-mirror-text animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
                  {editorialBusy
                    ? "Polishing shot · Gemini"
                    : "Styling · a moment"}
                </p>
              </div>
            </div>
          ) : null}
          {canOpenHeroLightbox && heroLightboxUrl ? (
            <button
              type="button"
              className="absolute inset-0 z-[5] cursor-zoom-in rounded-[14px] border-0 bg-transparent p-0 shadow-none ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
              onClick={() => setLightboxSrc(heroLightboxUrl)}
              aria-label="View image larger"
            />
          ) : null}
        </div>
        {referenceModelOverrideActive && !showResult ? (
          <p className="relative mt-2 text-left text-[10px] leading-snug text-mirror-muted">
            Model: a past try-on result. Generate sends this image as the body
            reference.
          </p>
        ) : null}
        {referenceStatus !== "ready" ? (
          <p className="relative mt-3 text-left text-[11px] leading-relaxed text-mirror-muted">
            {referenceStatus === "loading"
              ? "Checking your reference photo…"
              : "Add a full-body reference photo in the web app Settings to generate try-ons."}
          </p>
        ) : null}
      </section>

      <section className="rounded-card bg-mirror-card p-4">
        <div className="flex items-start justify-center gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <button
              type="button"
              className={avatarSlotClass()}
              onClick={() => setRefPickerOpen(true)}
              aria-label="Choose model reference"
            >
              {avatarTileDisplayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarTileDisplayUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              ) : (
                <span className="px-1 text-center font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-mirror-muted">
                  Add ref
                </span>
              )}
            </button>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-mirror-muted">
              Avatar
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="relative w-full max-w-[72px]">
              <button
                type="button"
                className={slotButtonClass(activeGarment === "top")}
                onClick={() => onActiveGarmentChange("top")}
                aria-label="Active garment: top"
              >
                {topTileSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={topTileSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="text-[9px] font-medium text-mirror-muted">
                    Top
                  </span>
                )}
              </button>
              {selectedTop ? (
                <button
                  type="button"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-mirror-card bg-mirror-text text-[10px] font-bold leading-none text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearSlot("top");
                  }}
                  aria-label="Clear saved top"
                >
                  ×
                </button>
              ) : null}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-mirror-muted">
              Top
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="relative w-full max-w-[72px]">
              <button
                type="button"
                className={slotButtonClass(activeGarment === "bottom")}
                onClick={() => onActiveGarmentChange("bottom")}
                aria-label="Active garment: bottom"
              >
                {bottomTileSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bottomTileSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="text-[9px] font-medium text-mirror-muted">
                    Bottom
                  </span>
                )}
              </button>
              {selectedBottom ? (
                <button
                  type="button"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-mirror-card bg-mirror-text text-[10px] font-bold leading-none text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearSlot("bottom");
                  }}
                  aria-label="Clear saved bottom"
                >
                  ×
                </button>
              ) : null}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-mirror-muted">
              Bottom
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-card bg-mirror-card p-4 flex flex-col gap-2">
        {showRegenerate ? (
          <>
            <button
              type="button"
              className="flex w-full items-center justify-center rounded-full border border-mirror-border bg-mirror-card py-[14px] text-[14px] font-medium tracking-[0.01em] text-mirror-text transition-colors duration-150 hover:bg-mirror-panel disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onRegenerate}
              disabled={
                regenerateDisabled || phase === "loading" || editorialBusy
              }
            >
              {phase === "loading" ? "Generating…" : "Regenerate"}
            </button>
            {showEditorialCta && onEditorialPose ? (
              <button
                type="button"
                className="flex w-full items-center justify-center rounded-full bg-mirror-text py-[14px] text-[14px] font-medium tracking-[0.01em] text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onEditorialPose}
                disabled={
                  regenerateDisabled || phase === "loading" || editorialBusy
                }
              >
                {editorialBusy ? "Polishing…" : "Editorial shot"}
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2.5 rounded-full bg-mirror-accent py-[14px] text-[14px] font-medium tracking-[0.01em] text-white shadow-accent-cta transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            onClick={onRunTryOn}
            disabled={generateDisabled || phase === "loading" || editorialBusy}
          >
            <IconCamera />
            {phase === "loading" ? "Generating…" : "Generate"}
          </button>
        )}
      </section>

      <section className="rounded-card bg-mirror-card p-4">
        <p className="mb-0.5 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          Choose garment
        </p>
        <p className="mb-3 mt-1 text-left text-[11px] text-mirror-muted">
          From saved or this page
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              { value: "top" as const, label: "Tops" },
              { value: "bottom" as const, label: "Bottoms" },
              { value: "this_page" as const, label: "This page" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={value === "this_page" && !hasProductImage}
              onClick={() => onListFilterChange(value)}
              className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                listFilter === value
                  ? "border-mirror-text bg-mirror-text text-white"
                  : "border-mirror-border bg-mirror-card text-mirror-text hover:bg-mirror-panel"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {listFilter === "this_page" ? (
          <div className="space-y-3">
            {!hasProductImage ? (
              <p className="text-left text-xs text-mirror-muted">
                No product image on this tab. Open a product page on Home, or
                pick a saved garment.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onSelectThisPageGarment();
                  }}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-mirror-text bg-mirror-soft px-2 py-2 text-left"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-mirror-bg2">
                    {pdpGarment ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pdpGarment.imageUrl}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-mirror-text">
                      {productLabel}
                    </p>
                    <p className="text-[10px] text-mirror-muted">
                      Product on this tab
                    </p>
                  </div>
                </button>
                <div>
                  <p className="mb-2 text-left text-[10px] font-semibold text-mirror-text">
                    Garment type
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { value: "top" as const, label: "Top" },
                        { value: "bottom" as const, label: "Bottom" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onPdpGarmentCategoryChange(value)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                          pdpGarmentCategory === value
                            ? "border-mirror-text bg-mirror-text text-white"
                            : "border-mirror-border bg-mirror-card text-mirror-text hover:bg-mirror-panel"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {savedLoading ? (
              <p className="text-left text-xs text-mirror-muted">
                Loading saved items…
              </p>
            ) : null}
            {savedError ? (
              <p className="text-left text-xs text-mirror-danger">
                {savedError}
              </p>
            ) : null}
            {!savedLoading && !savedError && filtered.length === 0 ? (
              <p className="text-left text-xs text-mirror-muted">
                No saved {listFilter === "top" ? "tops" : "bottoms"} yet. Save
                from a product page on the Home tab, or use This page.
              </p>
            ) : null}
            <ul className="mt-2 max-h-[200px] space-y-2 overflow-y-auto [-webkit-overflow-scrolling:touch] pr-1">
              {filtered.map((g) => {
                const picked =
                  (g.bucket === "top" &&
                    selectedTop?.productId === g.productId) ||
                  (g.bucket === "bottom" &&
                    selectedBottom?.productId === g.productId);
                return (
                  <li key={g.closetItemId}>
                    <button
                      type="button"
                      onClick={() => onSelectSavedGarment(g)}
                      className={`flex w-full items-center gap-3 rounded-[12px] border px-2 py-2 text-left transition-colors ${
                        picked
                          ? "border-mirror-text bg-mirror-soft"
                          : "border-mirror-border bg-mirror-card hover:border-mirror-ink2/35"
                      }`}
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-mirror-bg2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={g.imageUrl}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-mirror-text">
                          {g.name}
                        </p>
                        {g.brand ? (
                          <p className="truncate text-[11px] text-mirror-muted">
                            {g.brand}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {showResult ? (
        <button
          type="button"
          onClick={onShareToFeed}
          disabled={posted}
          className={`w-full rounded-full border py-3 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${
            posted
              ? "cursor-default border-mirror-border bg-mirror-panel text-mirror-muted"
              : "border-mirror-border bg-mirror-card text-mirror-text active:scale-[0.98]"
          }`}
        >
          <span
            className="relative grid w-full min-h-[1.25rem] place-items-center [grid-template-areas:'stack']"
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              aria-hidden={posted}
              className={`[grid-area:stack] transition-opacity duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${
                posted ? "opacity-0" : "opacity-100"
              }`}
            >
              Share to feed
            </span>
            <span
              aria-hidden={!posted}
              className={`[grid-area:stack] transition-opacity duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${
                posted ? "opacity-100" : "opacity-0"
              }`}
            >
              Shared to feed
            </span>
          </span>
        </button>
      ) : null}

      {error ? (
        <p className="text-center text-sm text-mirror-danger">{error}</p>
      ) : null}

      {refPickerOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal
          aria-label="Model reference"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRefPickerOpen(false);
          }}
        >
          <div className="max-h-[min(70vh,420px)] w-full max-w-sm overflow-hidden rounded-card border border-mirror-border bg-mirror-card shadow-tabbar">
            <div className="flex items-center justify-between border-b border-mirror-border px-4 py-3">
              <p className="text-sm font-semibold text-mirror-text">
                Model reference
              </p>
              <button
                type="button"
                className="rounded-full px-2 py-1 text-lg leading-none text-mirror-muted hover:bg-mirror-panel"
                onClick={() => setRefPickerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="max-h-[min(60vh,360px)] overflow-y-auto px-3 py-3">
              <button
                type="button"
                className="mb-3 w-full rounded-xl border border-mirror-border bg-mirror-card px-3 py-2.5 text-left text-xs font-medium text-mirror-text transition-colors hover:bg-mirror-panel"
                onClick={() => {
                  onClearReferenceModel();
                  setRefPickerOpen(false);
                }}
              >
                Use saved body photo (reference)
              </button>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-mirror-muted">
                Past try-ons
              </p>
              {recentModelPicks.length === 0 ? (
                <p className="text-xs text-mirror-muted">
                  No completed try-ons yet.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2">
                  {recentModelPicks.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="aspect-square w-full overflow-hidden rounded-lg border border-mirror-border bg-mirror-panel transition-colors hover:border-mirror-ink2/50"
                        onClick={() => {
                          void Promise.resolve(onPickReferenceModel(p.id)).then(
                            () => setRefPickerOpen(false),
                          );
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.thumbUrl}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/92 p-3"
          role="dialog"
          aria-modal
          aria-label="Enlarged image"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxSrc(null);
          }}
        >
          <div className="flex max-h-[100dvh] max-w-full flex-col items-stretch gap-2">
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/25"
                onClick={() => setLightboxSrc(null)}
                aria-label="Close enlarged image"
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxSrc}
              alt=""
              className="max-h-[min(88dvh,720px)] max-w-full shrink object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

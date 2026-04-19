import {
  ConfidenceCtaRow,
  ConfidenceProductRow,
  ConfidenceSignals,
} from "../confidence/ConfidenceSignals";
import type { FitScoreTileState } from "../confidence/ConfidenceSignals";
import { WornByStrip, type WornByStripState } from "../confidence/WornByStrip";

export type HomeRecentSavedItem = {
  id: string;
  imageUrl: string;
};

type HomeViewProps = {
  productName: string;
  brandLine: string;
  priceLabel: string;
  productImage?: string;
  /** When signed in but detection has no usable image URL yet — explains disabled Try on me. */
  missingProductImageHint: boolean;
  tryOnCtaDisabled: boolean;
  tryOnCtaBusy: boolean;
  onTryOnMe: () => void;
  onCircleTab: () => void;
  onSaveToCloset?: () => void;
  saveToClosetDisabled?: boolean;
  saveToClosetBusy?: boolean;
  saveToClosetSaved?: boolean;
  saveToClosetMessage?: string | null;
  /** Current PDP URL matches an owned closet row (by product URL hash). */
  pdpIsOwned?: boolean;
  onMarkOwned?: () => void;
  ownedDisabled?: boolean;
  ownedBusy?: boolean;
  ownedMessage?: string | null;
  fitScore?: FitScoreTileState;
  onCheckFitScore?: () => void;
  checkFitScoreDisabled?: boolean;
  wornBy?: WornByStripState;
  onWornByPress?: () => void;
  recentSaved?: HomeRecentSavedItem[];
  onSeeAllSaved?: () => void;
};

function RecentlySavedRow({
  items,
  onSeeAll,
}: {
  items: HomeRecentSavedItem[];
  onSeeAll: () => void;
}) {
  const tiles = [0, 1, 2].map((i) => {
    const row = items[i];
    if (row) {
      return {
        key: row.id,
        imageUrl: row.imageUrl,
        monoCaption: null as string | null,
      };
    }
    return {
      key: `placeholder-${i}`,
      imageUrl: null as string | null,
      monoCaption: `SAVED ${String(i + 1).padStart(2, "0")}`,
    };
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          Recently saved
        </span>
        <button
          type="button"
          onClick={onSeeAll}
          className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-ink2 transition-colors duration-150 hover:text-mirror-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
        >
          see all →
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div
            key={t.key}
            className="aspect-square overflow-hidden rounded-[10px] border border-mirror-border bg-mirror-bg2"
          >
            {t.imageUrl ? (
              <img src={t.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "repeating-linear-gradient(135deg, #E8E2D6 0px, #E8E2D6 4px, #DED7C8 4px, #DED7C8 8px)",
                  }}
                  aria-hidden
                />
                <span className="relative rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-mirror-ink2 [background-color:rgba(245,242,237,0.85)]">
                  {t.monoCaption}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeView({
  productName,
  brandLine,
  priceLabel,
  productImage,
  missingProductImageHint,
  tryOnCtaDisabled,
  tryOnCtaBusy,
  onTryOnMe,
  onCircleTab,
  onSaveToCloset,
  saveToClosetDisabled = false,
  saveToClosetBusy = false,
  saveToClosetSaved = false,
  saveToClosetMessage = null,
  pdpIsOwned = false,
  onMarkOwned,
  ownedDisabled = false,
  ownedBusy = false,
  ownedMessage = null,
  fitScore,
  onCheckFitScore,
  checkFitScoreDisabled = false,
  wornBy,
  onWornByPress,
  recentSaved = [],
  onSeeAllSaved,
}: HomeViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-[18px] rounded-card border border-mirror-border bg-mirror-card p-[18px]">
        <ConfidenceProductRow
          name={productName}
          brandLine={brandLine}
          priceLabel={priceLabel}
          imageUrl={productImage}
          onSave={onSaveToCloset}
          saveDisabled={saveToClosetDisabled}
          saveBusy={saveToClosetBusy}
          saveSaved={saveToClosetSaved}
        />
        {saveToClosetMessage ? (
          <p
            className={`text-left text-[11px] leading-relaxed ${
              saveToClosetSaved ? "text-mirror-muted" : "text-mirror-danger"
            }`}
          >
            {saveToClosetMessage}
          </p>
        ) : null}
        {pdpIsOwned ? (
          <div
            className="w-full rounded-full bg-mirror-text py-2.5 text-center text-[12.5px] font-medium text-white"
            role="status"
          >
            {"\u2713"} Added to closet
          </div>
        ) : (
          <button
            type="button"
            onClick={onMarkOwned}
            disabled={!onMarkOwned || ownedDisabled || ownedBusy}
            className="w-full rounded-full border border-mirror-border bg-transparent py-2.5 text-center text-[12.5px] font-medium text-mirror-text transition-colors duration-150 hover:bg-mirror-bg2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ownedBusy ? "Saving…" : "I own this"}
          </button>
        )}
        {ownedMessage ? (
          <p
            className={`text-left text-[11px] leading-relaxed ${
              ownedMessage.includes("Could not") || ownedMessage.includes("No product")
                ? "text-mirror-danger"
                : "text-mirror-muted"
            }`}
          >
            {ownedMessage}
          </p>
        ) : null}
        <ConfidenceSignals
          fitScore={fitScore}
          onFitScorePress={onCheckFitScore}
          fitScorePressDisabled={checkFitScoreDisabled}
        />
        {wornBy ? (
          <WornByStrip state={wornBy} onClick={onWornByPress} />
        ) : null}
        {missingProductImageHint ? (
          <p className="text-left text-[11px] leading-relaxed text-mirror-muted">
            Mirror needs a product image from this tab. Focus the store page,
            then tap <span className="font-semibold text-mirror-text">M</span>{" "}
            on the right edge to refresh detection.
          </p>
        ) : null}
        <ConfidenceCtaRow
          onTryOn={onTryOnMe}
          onAskCircle={onCircleTab}
          tryOnDisabled={tryOnCtaDisabled}
          tryOnBusy={tryOnCtaBusy}
        />
      </section>

      {onSeeAllSaved ? (
        <RecentlySavedRow items={recentSaved} onSeeAll={onSeeAllSaved} />
      ) : null}
    </div>
  );
}

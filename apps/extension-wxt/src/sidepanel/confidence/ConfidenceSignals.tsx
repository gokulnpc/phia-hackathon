import { IconBookmark, IconMessage, IconSparkleOutline } from "../icons";

export type TryOnPhase = "idle" | "loading" | "result" | "error";

export type FitScoreTileState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; score: number; colorScore: number }
  | { kind: "empty_closet" }
  | { kind: "error" };

type ConfidenceSignalsProps = {
  fitScore?: FitScoreTileState;
  onFitScorePress?: () => void;
  fitScorePressDisabled?: boolean;
};

export function buildFitScoreSignal(
  state: FitScoreTileState,
): { value: string; hint: string; tone: "good" | "bad" | "neutral" } {
  if (state.kind === "loading") return { value: "Scoring…", hint: "", tone: "neutral" };
  if (state.kind === "empty_closet") return { value: "—", hint: "Add to closet", tone: "neutral" };
  if (state.kind === "error") return { value: "—", hint: "Error", tone: "neutral" };
  if (state.kind === "result") {
    const s = Math.max(0, Math.min(100, Math.round(state.score)));
    if (s >= 75) return { value: `${s}`, hint: "Strong match", tone: "good" };
    if (s >= 50) return { value: `${s}`, hint: "Fair match", tone: "neutral" };
    return { value: `${s}`, hint: "Weak match", tone: "bad" };
  }
  return { value: "—", hint: "Run try-on", tone: "neutral" };
}

type CardCopy = {
  colorValue: string;
  finalValue: string;
  finalTone: "good" | "bad" | "neutral";
  verdict: string;
  buttonLabel: string;
  buttonDisabled: boolean;
};

function copyForState(state: FitScoreTileState): CardCopy {
  switch (state.kind) {
    case "loading":
      return {
        colorValue: "…",
        finalValue: "…",
        finalTone: "neutral",
        verdict: "Scoring against your owned closet",
        buttonLabel: "Scoring…",
        buttonDisabled: true,
      };
    case "result": {
      const final = buildFitScoreSignal(state);
      const c = Math.max(0, Math.min(100, Math.round(state.colorScore)));
      return {
        colorValue: `${c}`,
        finalValue: final.value,
        finalTone: final.tone,
        verdict: final.hint || "Scored against your closet",
        buttonLabel: "Regenerate",
        buttonDisabled: false,
      };
    }
    case "empty_closet":
      return {
        colorValue: "—",
        finalValue: "—",
        finalTone: "neutral",
        verdict: "Add Owned items to your closet first",
        buttonLabel: "Generate fit score",
        buttonDisabled: true,
      };
    case "error":
      return {
        colorValue: "—",
        finalValue: "—",
        finalTone: "neutral",
        verdict: "Couldn't score",
        buttonLabel: "Retry",
        buttonDisabled: false,
      };
    default:
      return {
        colorValue: "—",
        finalValue: "—",
        finalTone: "neutral",
        verdict: "Tap to score against your closet",
        buttonLabel: "Generate fit score",
        buttonDisabled: false,
      };
  }
}

export function ConfidenceSignals({
  fitScore = { kind: "idle" },
  onFitScorePress,
  fitScorePressDisabled = false,
}: ConfidenceSignalsProps) {
  const copy = copyForState(fitScore);
  const finalColor =
    copy.finalTone === "bad"
      ? "text-mirror-danger"
      : "text-mirror-text";

  const buttonDisabled =
    copy.buttonDisabled || fitScorePressDisabled || !onFitScorePress;

  return (
    <section className="flex flex-col gap-3 rounded-tile border border-mirror-border bg-mirror-card p-3.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
        Fit score
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
            Color
          </span>
          <span className="font-display text-[26px] font-normal leading-[1.1] tracking-[-0.01em] text-mirror-text">
            {copy.colorValue}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
            Final
          </span>
          <span
            className={`font-display text-[26px] font-normal leading-[1.1] tracking-[-0.01em] ${finalColor}`}
          >
            {copy.finalValue}
          </span>
        </div>
      </div>

      {copy.verdict ? (
        <p className="text-[11px] leading-snug text-mirror-muted">
          {copy.verdict}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onFitScorePress}
        disabled={buttonDisabled}
        className="w-full rounded-full bg-mirror-text py-2.5 text-center text-[12.5px] font-medium text-white transition-colors duration-150 hover:bg-mirror-ink2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copy.buttonLabel}
      </button>
    </section>
  );
}

type ConfidenceProductRowProps = {
  name: string;
  brandLine: string;
  priceLabel: string;
  imageUrl?: string;
  onSave?: () => void;
  saveDisabled?: boolean;
  saveBusy?: boolean;
  saveSaved?: boolean;
};

export function ConfidenceProductRow({
  name,
  brandLine,
  priceLabel,
  imageUrl,
  onSave,
  saveDisabled = false,
  saveBusy = false,
  saveSaved = false,
}: ConfidenceProductRowProps) {
  const canSave = Boolean(onSave);
  const priceMeta = priceLabel.trim() || "—";
  return (
    <div className="flex items-center gap-3.5 text-left">
      {/* Product thumbnail — 76×76 per design spec */}
      <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-mirror-bg2">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(135deg, #E8E2D6 0px, #E8E2D6 4px, #DED7C8 4px, #DED7C8 8px)",
              }}
              aria-hidden
            />
            <span className="relative rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-mirror-ink2 [background-color:rgba(245,242,237,0.85)]">
              Product
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          {brandLine}
        </div>
        <div className="mt-1 truncate font-display text-[22px] font-normal leading-[1.1] tracking-[-0.01em] text-mirror-text">
          {name}
        </div>
        <div className="mt-1 truncate text-[12.5px] font-normal leading-[1.5] text-mirror-ink2">
          {priceMeta}
        </div>
      </div>
      {/* Bookmark toggle — 34px circular per design spec */}
      <button
        type="button"
        onClick={canSave ? onSave : undefined}
        disabled={!canSave || saveDisabled || saveBusy}
        title={
          saveSaved ? "Saved to My Closet" : saveBusy ? "Saving…" : "Save to My Closet"
        }
        aria-label={
          saveSaved ? "Saved to My Closet" : saveBusy ? "Saving" : "Save product to My Closet"
        }
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
          saveSaved
            ? "border-mirror-text bg-mirror-text text-white"
            : "border-mirror-border bg-transparent text-mirror-muted hover:bg-mirror-bg2 disabled:cursor-not-allowed disabled:opacity-50"
        }`}
      >
        <IconBookmark className={saveSaved ? "text-white" : "text-mirror-muted"} />
      </button>
    </div>
  );
}

type ConfidenceCtaRowProps = {
  onTryOn: () => void;
  onAskCircle: () => void;
  tryOnDisabled: boolean;
  tryOnBusy: boolean;
};

export function ConfidenceCtaRow({
  onTryOn,
  onAskCircle,
  tryOnDisabled,
  tryOnBusy,
}: ConfidenceCtaRowProps) {
  return (
    <div className="flex gap-2">
      {/* Primary: black fill — "Try on me" is primary action, not a generation action */}
      <button
        type="button"
        onClick={onTryOn}
        disabled={tryOnDisabled}
        className="flex flex-[1.5] items-center justify-center gap-2.5 rounded-full bg-mirror-text py-[14px] text-[14px] font-medium tracking-[0.01em] text-white transition-colors hover:bg-mirror-ink2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconSparkleOutline />
        {tryOnBusy ? "Generating…" : "Try on me"}
      </button>
      {/* Secondary: outline */}
      <button
        type="button"
        onClick={onAskCircle}
        className="flex flex-1 items-center justify-center gap-2.5 rounded-full border border-mirror-text bg-transparent py-[14px] text-[14px] font-medium tracking-[0.01em] text-mirror-text transition-colors hover:bg-mirror-bg2"
      >
        <IconMessage />
        Ask circle
      </button>
    </div>
  );
}

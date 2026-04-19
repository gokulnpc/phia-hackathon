import type { FitScoreResult } from "@mirror/sdk-js";
import { IconLayers } from "../icons";

export type FitScorePhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty_closet"; cta: string }
  | { kind: "result"; result: FitScoreResult }
  | { kind: "error"; message: string };

type SavedGarmentThumb = {
  closetItemId: string;
  name: string;
  imageUrl: string;
};

export type FitScoreViewProps = {
  phase: FitScorePhase;
  canCheck: boolean;
  onCheck: () => void;
  savedGarments?: SavedGarmentThumb[];
};

const ROW_LABELS: Array<[keyof FitScoreResult["breakdown"], string]> = [
  ["silhouette", "Silhouette match"],
  ["color_palette", "Color palette"],
  ["closet_overlap", "Closet overlap"],
  ["occasion_fit", "Occasion fit"],
  ["brand_affinity", "Brand affinity"],
];

const RING_CIRCUMFERENCE = 314; // 2 * Math.PI * 50, the stroke-dasharray

function ringOffset(score: number): number {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return Math.round(RING_CIRCUMFERENCE * (1 - pct));
}

function verdictFor(score: number): string {
  if (score >= 75) return "Strong fit";
  if (score >= 50) return "Fair fit";
  return "Weak fit";
}

function Ring({ score, centerText }: { score: number; centerText: string }) {
  return (
    <div className="relative mx-auto mb-3 h-[120px] w-[120px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle className="fill-none stroke-mirror-border" strokeWidth={10} cx={60} cy={60} r={50} />
        <circle
          className="fill-none stroke-mirror-text transition-[stroke-dashoffset] duration-500"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={ringOffset(score)}
          cx={60}
          cy={60}
          r={50}
        />
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-display text-[40px] font-normal leading-none text-mirror-text">
        {centerText}
      </div>
    </div>
  );
}

function BreakdownRows({
  breakdown,
  disabled,
}: {
  breakdown: FitScoreResult["breakdown"];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-tile border border-mirror-border bg-mirror-card px-4 py-3.5">
      {ROW_LABELS.map(([key, label]) => {
        const raw = breakdown[key];
        const pct = Math.max(0, Math.min(100, Number(raw) || 0));
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="flex-1 text-[13px] text-mirror-ink2">{label}</span>
            <div className="h-1.5 flex-[1.4] overflow-hidden rounded-full bg-mirror-panel">
              <div
                className={`h-full rounded-full bg-mirror-text transition-[width] duration-500 ${disabled ? "opacity-50" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs text-mirror-muted">{pct}</span>
          </div>
        );
      })}
    </div>
  );
}

function CheckButton({ onCheck, disabled, label }: { onCheck: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onCheck}
      disabled={disabled}
      className="mt-3 rounded-full bg-mirror-text px-5 py-2.5 text-[13px] font-medium tracking-[0.01em] text-white transition-colors hover:bg-mirror-ink2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function MatchingItemsList({
  title,
  items,
  savedGarments,
  tone,
}: {
  title: string;
  items: FitScoreResult["matching_items"];
  savedGarments: SavedGarmentThumb[];
  tone: "match" | "conflict";
}) {
  if (!items.length) return null;
  const thumbFor = (id: string): SavedGarmentThumb | null =>
    savedGarments.find((g) => g.closetItemId === id) ?? null;
  return (
    <div className="rounded-tile border border-mirror-border bg-mirror-card px-4 py-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
        {title}
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((it) => {
          const thumb = thumbFor(it.closet_item_id);
          return (
            <div key={it.closet_item_id} className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-mirror-panel">
                {thumb?.imageUrl ? (
                  <img src={thumb.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-mirror-text">
                  {thumb?.name ?? "Owned item"}
                </div>
                <div
                  className={`truncate text-[11px] ${tone === "match" ? "text-mirror-muted" : "text-mirror-danger"}`}
                >
                  {it.reason}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FitScoreView({ phase, canCheck, onCheck, savedGarments = [] }: FitScoreViewProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="mx-1 mt-1 font-display text-2xl font-normal italic leading-tight text-mirror-text">
        Your <em className="italic">fit score</em>
      </h2>

      {phase.kind === "idle" ? (
        <div className="flex flex-col items-center rounded-card bg-mirror-card px-5 py-5 text-center">
          <Ring score={0} centerText="—" />
          <p className="text-sm text-mirror-ink2">
            Check how this product pairs with your <strong>owned closet</strong>.
          </p>
          <CheckButton onCheck={onCheck} disabled={!canCheck} label="Check fit score" />
        </div>
      ) : null}

      {phase.kind === "loading" ? (
        <div className="flex flex-col items-center rounded-card bg-mirror-card px-5 py-5 text-center">
          <Ring score={0} centerText="…" />
          <p className="text-sm text-mirror-ink2">Scoring against your closet…</p>
        </div>
      ) : null}

      {phase.kind === "empty_closet" ? (
        <div className="flex flex-col items-center rounded-card bg-mirror-card px-5 py-5 text-center">
          <Ring score={0} centerText="—" />
          <p className="text-sm text-mirror-ink2">{phase.cta}</p>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="flex flex-col items-center rounded-card bg-mirror-card px-5 py-5 text-center">
          <Ring score={0} centerText="—" />
          <p className="text-sm text-mirror-danger">{phase.message}</p>
          <CheckButton onCheck={onCheck} disabled={!canCheck} label="Try again" />
        </div>
      ) : null}

      {phase.kind === "result" ? (
        <>
          <div className="flex flex-col items-center rounded-card bg-mirror-card px-5 py-5 text-center">
            <Ring score={phase.result.overall_score} centerText={String(phase.result.overall_score)} />
            <p className="text-sm text-mirror-ink2">
              {verdictFor(phase.result.overall_score)} —{" "}
              <span className="text-mirror-muted">{phase.result.explanation}</span>
              {phase.result.confidence === "low" ? (
                <span className="text-mirror-muted"> (few items — confidence low)</span>
              ) : null}
            </p>
          </div>

          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">The breakdown</div>
          <BreakdownRows breakdown={phase.result.breakdown} />

          <MatchingItemsList
            title="Pairs well with"
            items={phase.result.matching_items}
            savedGarments={savedGarments}
            tone="match"
          />
          <MatchingItemsList
            title="Might clash with"
            items={phase.result.conflicts}
            savedGarments={savedGarments}
            tone="conflict"
          />

          <div className="mt-1 flex gap-3 rounded-tile border border-mirror-border bg-mirror-card p-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mirror-bg2 text-mirror-ink2">
              <IconLayers />
            </div>
            <p className="text-xs leading-[1.55] text-mirror-muted">
              Scores come from Gemini against your owned closet. Re-check after you save new items.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

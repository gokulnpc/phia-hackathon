import { IconWornBy } from "../icons";

export type WornByStripState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; count: number }
  | { kind: "error" };

type WornByStripProps = {
  state: WornByStripState;
  onClick?: () => void;
  disabled?: boolean;
};

function body(state: WornByStripState): { headline: string; hint: string } {
  switch (state.kind) {
    case "idle":
      return {
        headline: "Check who's worn this",
        hint: "Tap to find real people in this piece",
      };
    case "loading":
      return { headline: "Looking up…", hint: "Real-world fits" };
    case "result":
      if (state.count === 0) {
        return {
          headline: "Check who's worn this",
          hint: "Tap to find real people in this piece",
        };
      }
      return {
        headline: `Worn by ${state.count} ${state.count === 1 ? "person" : "people"}`,
        hint: "See how it looks on real people",
      };
    case "error":
      return { headline: "Couldn't load", hint: "Tap to retry" };
  }
}

export function WornByStrip({ state, onClick, disabled }: WornByStripProps) {
  const { headline, hint } = body(state);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={`${headline}. ${hint}`}
      className="flex w-full items-center gap-3 rounded-tile border border-mirror-border bg-mirror-card px-3.5 py-3 text-left transition-colors duration-150 hover:bg-mirror-bg2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mirror-bg2">
        <IconWornBy />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[14px] leading-tight text-mirror-text">
          {headline}
        </span>
        <span className="truncate text-[11px] text-mirror-muted">{hint}</span>
      </span>
      <span aria-hidden className="text-[18px] text-mirror-muted">
        ›
      </span>
    </button>
  );
}

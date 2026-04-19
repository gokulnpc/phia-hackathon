import { DEMO_FIT_OVERALL, DEMO_FIT_ROWS } from "../../lib/demoSocialPreview";

const DEMO_FIT_LABEL = "Demo fit score — not a live signal";

export function DemoFitStrip() {
  return (
    <div className="rounded-tile border border-mirror-border bg-mirror-card px-3.5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">{DEMO_FIT_LABEL}</p>
      <div className="relative mx-auto mt-2 flex h-[100px] w-[100px] items-center justify-center">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle className="fill-none stroke-mirror-border" strokeWidth={10} cx={60} cy={60} r={50} />
          <circle
            className="fill-none stroke-mirror-text"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={314}
            strokeDashoffset={314 * (1 - DEMO_FIT_OVERALL / 100)}
            cx={60}
            cy={60}
            r={50}
          />
        </svg>
        <span className="absolute font-display text-[28px] font-normal text-mirror-text">{DEMO_FIT_OVERALL}</span>
      </div>
      <p className="mt-1 text-center text-[11px] text-mirror-muted">Illustrative only — real scoring ships later.</p>
      <div className="mt-3 flex flex-col gap-2">
        {DEMO_FIT_ROWS.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="flex-1 text-[11px] text-mirror-ink2">{row.label}</span>
            <div className="h-1.5 flex-[1.2] overflow-hidden rounded-full bg-mirror-panel">
              <div
                className="h-full rounded-full bg-mirror-text"
                style={{ width: `${row.pct}%` }}
              />
            </div>
            <span className="w-7 text-right text-[10px] text-mirror-muted">{row.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

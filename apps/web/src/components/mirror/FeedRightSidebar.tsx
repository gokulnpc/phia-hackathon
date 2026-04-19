import { Avatar, Btn, Eyebrow, Placeholder } from "./primitives";

/** Pastel order matches phia_web `FRIENDS_SUGGESTED`: lav → sky → peach. */
const SUGGESTED = [
  { letter: "M", name: "Maya C.", handle: "@mayac", tag: "Coastal Grandma", variant: "lavender" as const },
  { letter: "J", name: "Jordan R.", handle: "@jordanr", tag: "Y2K Revival", variant: "sky" as const },
  { letter: "S", name: "Sarah K.", handle: "@sarahk", tag: "Old Money", variant: "peach" as const },
];

const TRENDING = [
  { name: "Linen blazer", brand: "Eileen Fisher", reacts: 24, variant: "peach" as const },
  { name: "Wool coat", brand: "COS", reacts: 18, variant: "sky" as const },
  { name: "Silk midi", brand: "Reformation", reacts: 14, variant: "rose" as const },
];

export function FeedRightSidebar() {
  return (
    <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
      {/* Style score */}
      <div className="rounded-mirror border border-hair bg-card p-[22px]">
        <div className="flex items-baseline justify-between">
          <h3 className="display-sm m-0 text-ink">Your style score</h3>
          <Eyebrow>LIVE</Eyebrow>
        </div>
        <div className="score-ring">
          <span>8.4</span>
        </div>
        <Eyebrow dot className="text-center">
          CONFIDENCE
        </Eyebrow>
        <p className="meta mt-1.5 text-center">
          Based on try-ons &amp; reactions this week
        </p>
      </div>

      {/* Suggested */}
      <div className="rounded-mirror border border-hair bg-card p-[22px]">
        <div className="flex items-baseline justify-between">
          <h3 className="display-sm m-0 text-ink">Suggested</h3>
          <button className="eyebrow text-ink">SEE ALL →</button>
        </div>
        <ul className="mt-2 flex flex-col">
          {SUGGESTED.map((s, i) => (
            <li
              key={s.handle}
              className={`grid grid-cols-[34px_1fr_auto] items-center gap-3 py-2.5 ${i > 0 ? "border-t border-hair" : ""}`}
            >
              <Avatar letter={s.letter} variant={s.variant} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink">{s.name}</div>
                <div className="meta truncate">
                  {s.handle} · <span className="text-ink3">{s.tag}</span>
                </div>
              </div>
              <Btn variant="ink" size="sm">
                Follow
              </Btn>
            </li>
          ))}
        </ul>
      </div>

      {/* Trending */}
      <div className="rounded-mirror border border-hair bg-card p-[22px]">
        <div className="flex items-baseline justify-between">
          <h3 className="display-sm m-0 text-ink">Trending</h3>
          <Eyebrow>THIS WEEK</Eyebrow>
        </div>
        <ul className="mt-2 flex flex-col">
          {TRENDING.map((t, i) => (
            <li
              key={t.name}
              className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 py-2.5 ${i > 0 ? "border-t border-hair" : ""}`}
            >
              <Placeholder
                variant={t.variant}
                caption={null}
                className="!rounded-mirror-xs"
                style={{ width: 40, height: 44 }}
              />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink">{t.name}</div>
                <div className="meta truncate">{t.brand}</div>
              </div>
              <span
                className="flex items-center gap-1 text-[12px]"
                style={{ color: "var(--peach)" }}
              >
                <FireIcon /> {t.reacts}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function FireIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5C8 9 9 8 9 6c1 .5 2 1 3-3Z" />
    </svg>
  );
}

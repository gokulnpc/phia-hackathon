import {
  DEMO_COMMENTS,
  DEMO_FRIENDS,
  DEMO_REACTIONS,
  DEMO_SOCIAL_BANNER,
  DEMO_PREVIEW_SECTION_TITLE,
  friendById,
} from "../../lib/demoSocialPreview";

type DemoSocialStripProps = {
  /** When true, show section title for "below real post" variant. */
  showSectionTitle?: boolean;
};

export function DemoSocialStrip({ showSectionTitle = false }: DemoSocialStripProps) {
  return (
    <div className="rounded-tile border border-dashed border-mirror-border bg-mirror-card px-3 py-3">
      {showSectionTitle ? (
        <p className="mb-2 text-[12px] text-mirror-text">{DEMO_PREVIEW_SECTION_TITLE}</p>
      ) : null}
      <p className="mb-3 rounded-lg px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
        {DEMO_SOCIAL_BANNER}
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {DEMO_REACTIONS.map((r) => (
          <span
            key={r.label}
            className="inline-flex items-center gap-1 rounded-full border border-mirror-border bg-mirror-card px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-mirror-ink2"
          >
            <span>
              {r.count} · {r.label}
            </span>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DEMO_FRIENDS.map((f) => (
          <div
            key={f.id}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-mirror-border bg-mirror-card px-2 py-1"
            title={f.name}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${f.avatarClass}`}
            >
              {f.initial}
            </div>
            <span className="max-w-[72px] truncate text-[10px] text-mirror-text">{f.name}</span>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {DEMO_COMMENTS.map((c, i) => {
          const friend = friendById(c.friendId);
          const who = friend?.name ?? "Friend";
          const initial = friend?.initial ?? "?";
          const av = friend?.avatarClass ?? "bg-mirror-bg2 text-mirror-text";
          return (
            <li key={i} className="rounded-tile border border-mirror-border bg-mirror-card px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${av}`}
                >
                  {initial}
                </div>
                <span className="text-[12px] text-mirror-text">{who}</span>
              </div>
              <p className="mt-1.5 pl-9 text-[13px] leading-[1.55] text-mirror-ink2">{c.body}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { Avatar } from "./primitives";

/**
 * Non-functional composer matching the editorial design — posting from web is
 * out of scope for this slice.
 */
export function FeedComposerPlaceholder({
  userInitial,
}: {
  userInitial: string;
  /** Unused; kept for call-site compatibility. */
  seed?: string;
}) {
  return (
    <div className="rounded-mirror border border-hair bg-card p-[18px]">
      <div className="flex items-start gap-3.5">
        <Avatar letter={userInitial} variant="rose" size="md" />
        <div className="min-w-0 flex-1">
          <textarea
            disabled
            rows={1}
            placeholder="Share a fit or ask for opinions…"
            className="min-h-[44px] w-full resize-none border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink3"
          />
          <div className="mt-2.5 flex items-center justify-between border-t border-hair pt-3">
            <div className="flex gap-1.5">
              <ToolChip label="Try-on">
                <FlaskIcon />
              </ToolChip>
              <ToolChip label="Photo">
                <ImageIcon />
              </ToolChip>
              <ToolChip label="Visibility">
                <LockIcon />
              </ToolChip>
            </div>
            <button
              type="button"
              disabled
              className="rounded-full border border-hair px-3 py-1.5 text-[12px] font-medium text-ink3"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolChip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span
      title={label}
      className="grid h-[30px] w-[30px] place-items-center rounded-full border border-hair text-ink2 opacity-70"
    >
      {children}
    </span>
  );
}

function FlaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 16-5-5L5 21" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

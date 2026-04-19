import type { ReactNode } from "react";

/**
 * Editorial page header.
 * Renders an eyebrow with `●` accent dot, a display-lg headline whose trailing
 * `accentWord` is italic and accent-coloured, and an optional subtitle. `right`
 * sits opposite the title block; `children` renders below (e.g. tabs).
 */
export function MirrorPageHeader({
  eyebrow,
  leadingTitle,
  accentWord,
  subtitle,
  right,
  children,
  /** When true, no horizontal/top padding — use inside a parent that already applies panel insets (e.g. feed). */
  flush = false,
}: {
  eyebrow?: string;
  leadingTitle: string;
  accentWord?: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
}) {
  return (
    <div
      className={
        flush
          ? "pb-3"
          : "px-6 pb-7 pt-7 md:px-10 md:pt-8"
      }
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-6 border-b border-hair ${
          flush ? "pb-4" : "pb-6"
        }`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          {eyebrow ? (
            <div className="eyebrow">
              <span style={{ color: "var(--accent)" }}>● </span>
              {eyebrow}
            </div>
          ) : null}
          <h1 className="display-lg m-0 max-w-[680px] text-ink">
            {leadingTitle}
            {accentWord ? (
              <>
                {" "}
                <span className="ital" style={{ color: "var(--accent)" }}>
                  {accentWord}
                </span>
              </>
            ) : null}
          </h1>
          {subtitle ? <p className="body text-ink3">{subtitle}</p> : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

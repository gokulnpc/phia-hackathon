export function MirrorAuthShell({
  leadingTitle,
  accentWord,
  subtitle,
  children,
}: {
  leadingTitle: string;
  accentWord?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-mirror border border-hair bg-card p-8">
        <h1 className="font-display m-0 text-[26px] font-normal leading-[1.1] tracking-[-0.01em] text-ink">
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
        {subtitle ? <p className="body-sm mt-3 text-ink3">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

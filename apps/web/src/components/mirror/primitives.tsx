/**
 * Editorial primitives shared across Mirror pages.
 * Mirrors the design system in apps/frontend_model/phia_web/design.md.
 */

import type { CSSProperties, ReactNode } from "react";

export type AccentVariant =
  | "lavender"
  | "peach"
  | "sage"
  | "butter"
  | "sky"
  | "rose";

export type PlaceholderVariant =
  | "warm"
  | "cool"
  | "lav"
  | "peach"
  | "sage"
  | "butter"
  | "sky"
  | "rose";

const PH_VARIANT_CLASS: Record<PlaceholderVariant, string> = {
  warm: "",
  cool: "ph-cool",
  lav: "ph-lav",
  peach: "ph-peach",
  sage: "ph-sage",
  butter: "ph-butter",
  sky: "ph-sky",
  rose: "ph-rose",
};

const PH_BADGE_CLASS = {
  ink: "",
  accent: "ph-badge-accent",
  peach: "ph-badge-peach",
  sage: "ph-badge-sage",
  butter: "ph-badge-butter",
} as const;

export type PlaceholderBadge = keyof typeof PH_BADGE_CLASS;

/** Inline fills so pastels always show (Tailwind utilities layer can beat @layer components). */
const AVATAR_FILL: Record<
  "lav" | "peach" | "sage" | "butter" | "sky" | "rose" | "ink",
  { bg: string; fg?: string }
> = {
  lav: { bg: "var(--lavender-soft)" },
  peach: { bg: "var(--peach-soft)" },
  sage: { bg: "var(--sage-soft)" },
  butter: { bg: "var(--butter-soft)" },
  sky: { bg: "var(--sky-soft)" },
  rose: { bg: "var(--rose-soft)" },
  ink: { bg: "var(--ink)", fg: "#fff" },
};

export function Placeholder({
  variant = "warm",
  caption,
  capTop,
  badge,
  badgeVariant = "ink",
  className = "",
  style,
  children,
}: {
  variant?: PlaceholderVariant;
  caption?: string | null;
  capTop?: string | null;
  badge?: string;
  badgeVariant?: PlaceholderBadge;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={`ph ${PH_VARIANT_CLASS[variant]} ${className}`} style={style}>
      {badge ? (
        <span className={`ph-badge ${PH_BADGE_CLASS[badgeVariant]}`}>{badge}</span>
      ) : null}
      {capTop ? <div className="ph-cap ph-cap-top ph-cap-center">{capTop}</div> : null}
      {caption ? <div className="ph-cap ph-cap-center">{caption}</div> : null}
      {children}
    </div>
  );
}

export function Avatar({
  letter,
  variant = "lavender",
  size = "md",
  className = "",
}: {
  letter: string;
  variant?: AccentVariant | "ink";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const v = variant === "lavender" ? "lav" : variant;
  const fill = AVATAR_FILL[v as keyof typeof AVATAR_FILL] ?? AVATAR_FILL.lav;
  const style: CSSProperties = {
    backgroundColor: fill.bg,
    ...(fill.fg ? { color: fill.fg } : {}),
  };
  return (
    <span
      className={`avatar avatar-${v} avatar-${size} ${className}`}
      style={style}
    >
      {letter}
    </span>
  );
}

export function Eyebrow({
  children,
  dot = false,
  className = "",
}: {
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <div className={`eyebrow ${className}`}>
      {dot ? <span style={{ color: "var(--accent)" }}>● </span> : null}
      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
  pad = "default",
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  pad?: "default" | "lg" | "sm" | "none";
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const padding =
    pad === "lg"
      ? "p-7"
      : pad === "sm"
        ? "p-3.5"
        : pad === "none"
          ? "p-0"
          : "p-[22px]";
  return (
    <div
      className={`rounded-mirror border border-hair bg-card ${padding} ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/** Pill button. */
export function Btn({
  variant = "ghost",
  size = "md",
  children,
  className = "",
  ...rest
}: {
  variant?: "ink" | "outline" | "ghost" | "accent" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClass = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2.5 text-[13px]";
  const variantClass =
    variant === "ink"
      ? "bg-ink text-white border-transparent hover:bg-black"
      : variant === "outline"
        ? "border-ink text-ink bg-transparent hover:bg-ink hover:text-white"
        : variant === "accent"
          ? "bg-accent text-white border-transparent shadow-mirror-md hover:brightness-95"
          : variant === "danger"
            ? "bg-danger text-white border-transparent"
            : "border-hair text-ink2 bg-transparent hover:border-ink hover:text-ink";
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-full border font-medium tracking-[0.01em] whitespace-nowrap transition-colors ${sizeClass} ${variantClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Outlined chip toggle (filter, category). */
export function Chip({
  active = false,
  children,
  className = "",
  ...rest
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[7px] text-[12px] font-medium transition-colors duration-150 ease-out ${
        active
          ? "border-ink bg-ink text-white"
          : "border-hair text-ink2 bg-transparent hover:border-ink hover:text-ink"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Tabs({ children }: { children: ReactNode }) {
  return <div className="inline-flex flex-wrap gap-1">{children}</div>;
}

export function Tab({
  active = false,
  count,
  children,
  ...rest
}: {
  active?: boolean;
  count?: number | string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-full px-3.5 py-2 text-[12.5px] transition-colors ${
        active
          ? "bg-ink text-white"
          : "text-ink2 hover:bg-[color-mix(in_oklch,var(--bg)_88%,var(--ink))]"
      }`}
      {...rest}
    >
      {children}
      {count != null ? (
        <span className={`ml-1.5 text-[11px] ${active ? "text-white/60" : "text-ink3"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Round icon button (34×34 hairline). */
export function IconBtn({
  children,
  className = "",
  active = false,
  danger = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  danger?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tone = danger
    ? "bg-danger text-white border-danger"
    : active
      ? "bg-ink text-white border-ink"
      : "border-hair text-ink2 hover:border-ink hover:text-ink";
  return (
    <button
      type="button"
      className={`inline-grid h-[34px] w-[34px] place-items-center rounded-full border bg-transparent transition-colors ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Pill search input (rounded full, hairline). */
export function SearchPill({
  value,
  onChange,
  placeholder,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-full border border-hair bg-card px-4 py-2.5 transition-colors focus-within:border-ink ${className}`}
    >
      <svg
        className="shrink-0 text-ink3"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
      >
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M9.5 9.5L13 13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-full border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink3"
      />
    </label>
  );
}

/** Hash a string to a stable accent variant. */
export function pickAvatarVariant(seed: string): AccentVariant {
  const palette: AccentVariant[] = ["lavender", "peach", "sage", "butter", "sky", "rose"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
  return palette[h % palette.length] ?? "lavender";
}

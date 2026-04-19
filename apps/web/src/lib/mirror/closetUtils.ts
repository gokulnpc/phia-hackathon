export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function hostFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function confidenceLabel(score: unknown): string {
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return "—/10";
  const out = Math.min(10, Math.max(0, Math.round(n * 10)));
  return `${out}/10`;
}

/** Closet filter buckets only: `top` or `bottom` (aligns with backend `products.category` coercion). */
export function normalizeClosetBucket(raw: unknown): "top" | "bottom" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "bottom" || s.includes("pant") || s.includes("trouser")) {
    return "bottom";
  }
  return "top";
}

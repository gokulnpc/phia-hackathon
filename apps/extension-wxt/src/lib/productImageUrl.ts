/** Normalize retailer image URLs for extension UI and API (e.g. protocol-relative og:image). */
export function normalizeProductImageUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

/** Aligns with web `normalizeClosetBucket` / backend `products.category` buckets. */
export type ClosetGarmentBucket = "top" | "bottom";

export function normalizeClosetGarmentBucket(raw: unknown): ClosetGarmentBucket {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return "top";
  if (
    s === "bottom" ||
    s.includes("pant") ||
    s.includes("trouser") ||
    s.includes("shorts") ||
    s.includes("skirt") ||
    s.includes("jean") ||
    s.includes("legging") ||
    s.includes("jogger") ||
    s.includes("sweatpant") ||
    s.includes("chino") ||
    s.includes("slack") ||
    s.includes("brief") ||
    s.includes("trunk") ||
    s.includes("boxer") ||
    s.includes("culotte") ||
    s.includes("sweatshort")
  ) {
    return "bottom";
  }
  return "top";
}

/** Schema / retailer strings that should not lock bucket without text heuristics. */
function isGenericCategoryHint(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  return (
    s === "clothing" ||
    s === "apparel" ||
    s === "fashion" ||
    s === "wear" ||
    s === "general" ||
    s === "unisex" ||
    s === "product" ||
    s === "item"
  );
}

/**
 * Word-boundary match on PDP title + path (not bare `short` — avoids "short sleeve").
 * Covers shorts, pants, jeans, skirts, etc.
 */
const BOTTOM_GARMENT_RE =
  /\b(shorts|sweatshorts|pants|trousers|jeans|skirts?|leggings?|joggers?|sweatpants?|chinos?|slacks?|briefs?|boxers?|trunks?|culottes?)\b/i;

function haystackFromPdp(name: string, url: string): string {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    /* ignore */
  }
  return `${name} ${path}`.toLowerCase();
}

/**
 * Infer top vs bottom for the current-tab PDP (extension try-on slots + garment_type).
 */
export function inferGarmentBucketFromPdp(p: {
  name: string;
  url: string;
  category?: string | undefined;
}): ClosetGarmentBucket {
  const cat = typeof p.category === "string" ? p.category.trim() : "";
  if (cat && !isGenericCategoryHint(cat)) {
    const fromSchema = normalizeClosetGarmentBucket(cat);
    if (fromSchema === "bottom") return "bottom";
  }
  const hay = haystackFromPdp(p.name, p.url);
  if (BOTTOM_GARMENT_RE.test(hay)) return "bottom";
  return "top";
}

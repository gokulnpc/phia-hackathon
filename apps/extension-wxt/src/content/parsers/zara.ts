/** Zara PDP extraction — JSON-LD is missing on many Zara PLPs; URL + DOM are authoritative. */

export type ZaraParsed = {
  url: string;
  name: string;
  image: string;
  brand?: string;
  price?: number;
  category?: string;
  /** Zara numeric SKU from URL tail `-p04580123.html` */
  productCode?: string;
};

const PDP_TAIL_RE = /([^/]+)-p(\d+)\.html(?:\?|$)/;

function humanizeSlug(slug: string): string {
  const cleaned = slug
    .replace(/[^\w\s-]/g, "")
    .split("-")
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!cleaned) return "";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function genderFromPath(pathname: string): string | undefined {
  const p = pathname.toLowerCase();
  if (/\/woman\//.test(p)) return "women";
  if (/\/man\//.test(p)) return "men";
  return undefined;
}

/** Pick largest descriptor from responsive srcset (`url 1x` or `url 560w`). */
function bestSrcFromImg(el: HTMLImageElement): string | null {
  const direct = el.currentSrc?.trim() || el.src?.trim();
  const ss = el.srcset?.trim();
  if (!ss) return direct?.trim() || null;
  let bestUrl = "";
  let bestPx = -1;
  for (const chunk of ss.split(",")) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const url = parts[0];
    const desc = parts[1]?.toLowerCase();
    let px = 0;
    if (desc?.endsWith("x")) px = Number.parseFloat(desc.slice(0, -1)) * 1000;
    else if (desc?.endsWith("w")) px = Number.parseInt(desc.slice(0, -1), 10) || 0;
    if (url && px >= bestPx) {
      bestPx = px;
      bestUrl = url;
    }
  }
  return bestUrl.trim() || direct?.trim() || null;
}

function lastBreadcrumbText(): string | null {
  const items = document.querySelectorAll(".breadcrumb__item, [class*='breadcrumb'] li");
  if (!items.length) return null;
  const last = items[items.length - 1];
  return last?.textContent?.trim() ?? null;
}

/**
 * Returns overlay fields when the current page looks like a Zara PDP.
 * Safe to call on any host — returns null if not zara.com or not a PDP URL.
 */
export function parseZaraProduct(): ZaraParsed | null {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith("zara.com")) return null;

  const url = window.location.href;
  const path = window.location.pathname;
  const m = url.match(PDP_TAIL_RE) ?? path.match(PDP_TAIL_RE);
  if (!m) return null;

  const slugRaw = m[1] ?? "";
  const productCode = m[2] ?? "";
  const slugTitle = humanizeSlug(slugRaw);

  const h1 =
    document.querySelector("h1[data-qa-qualifier='product-detail-info-header']") ??
    document.querySelector("h1.product-detail-info__header-name") ??
    document.querySelector(".product-detail-info__header-name");
  const nameFromDom =
    h1 instanceof HTMLElement ? h1.textContent?.trim() || "" : "";

  const name = nameFromDom.trim() || slugTitle || document.title.trim();

  const hero =
    document.querySelector("picture.media-image img") ??
    document.querySelector('[data-qa-qualifier="media-thumbnail-primary"] img') ??
    document.querySelector(".media-image img");
  let image = "";
  if (hero instanceof HTMLImageElement) {
    const u = bestSrcFromImg(hero);
    if (u) image = u;
  }

  const priceEl =
    document.querySelector(".money-amount__main") ??
    document.querySelector("[data-qa-qualifier='price-current']");
  let price: number | undefined;
  if (priceEl?.textContent) {
    const n = Number.parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) price = n;
  }

  const gender = genderFromPath(path);
  const category = lastBreadcrumbText() ?? undefined;

  const out: ZaraParsed = {
    url,
    name,
    image,
    brand: "Zara",
    price,
    category,
    productCode: productCode || undefined,
  };

  if (gender) {
    out.category = [category, gender].filter(Boolean).join(" · ") || gender;
  }

  return out;
}

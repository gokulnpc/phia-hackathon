import { normalizeProductImageUrl } from "../lib/productImageUrl";
import { parseZaraProduct } from "./parsers/zara";

export type ProductPayload = {
  url: string;
  name: string;
  image: string;
  price?: number;
  brand?: string;
  /** JSON-LD Product.category when present (e.g. schema.org breadcrumb text). */
  category?: string;
};

export type CatalogRule = {
  domain: string;
  priority: number;
  selector_config: Record<string, unknown>;
};

function textContent(sel: string): string | null {
  const el = document.querySelector(sel);
  return el?.textContent?.trim() ?? null;
}

function metaContent(property: string): string | null {
  const el = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return el?.getAttribute("content")?.trim() ?? null;
}

function typesOf(o: Record<string, unknown>): string[] {
  const t = o["@type"];
  if (Array.isArray(t)) return t.map((x) => String(x));
  if (typeof t === "string") return [t];
  return [];
}

function isProductType(types: string[]): boolean {
  return types.some((x) => x === "Product" || x === "product");
}

function coalesceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function extractPriceFromOfferObject(offer: Record<string, unknown>): number | undefined {
  return coalesceNumber(offer.price);
}

/** Offers: single Offer, AggregateOffer, array of offers, or nested structures (e.g. Amazon). */
function extractPriceFromOffers(offers: unknown): number | undefined {
  if (offers === null || offers === undefined) return undefined;

  if (Array.isArray(offers)) {
    for (const item of offers) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const t = typesOf(o);
      if (t.includes("AggregateOffer")) {
        const agg = extractAggregateOfferPrice(o);
        if (agg !== undefined) return agg;
      }
      const single = extractPriceFromOfferObject(o);
      if (single !== undefined) return single;
    }
    return undefined;
  }

  if (typeof offers === "object") {
    const o = offers as Record<string, unknown>;
    const t = typesOf(o);
    if (t.includes("AggregateOffer")) {
      const agg = extractAggregateOfferPrice(o);
      if (agg !== undefined) return agg;
    }
    return extractPriceFromOfferObject(o);
  }

  return undefined;
}

function extractAggregateOfferPrice(o: Record<string, unknown>): number | undefined {
  const low = coalesceNumber(o.lowPrice);
  if (low !== undefined) return low;
  const high = coalesceNumber(o.highPrice);
  if (high !== undefined) return high;
  return extractPriceFromOffers(o.offers);
}

function nodesFromJsonLdChunk(chunk: unknown): Record<string, unknown>[] {
  if (chunk === null || typeof chunk !== "object") return [];
  const d = chunk as Record<string, unknown>;
  if (Array.isArray(d["@graph"])) {
    return (d["@graph"] as unknown[]).filter(
      (x): x is Record<string, unknown> => x !== null && typeof x === "object",
    );
  }
  return [d];
}

function productImageFromObject(o: Record<string, unknown>): string | null {
  const img = o.image;
  if (typeof img === "string") return img;
  if (Array.isArray(img) && typeof img[0] === "string") return img[0];
  if (
    img &&
    typeof img === "object" &&
    "url" in img &&
    typeof (img as { url: string }).url === "string"
  ) {
    return (img as { url: string }).url;
  }
  return null;
}

function parseJsonLdProduct(): Partial<ProductPayload> | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent ?? "") as unknown;
      const topChunks = Array.isArray(data) ? data : [data];
      for (const chunk of topChunks) {
        for (const o of nodesFromJsonLdChunk(chunk)) {
          if (!isProductType(typesOf(o))) continue;
          const name = typeof o.name === "string" ? o.name : null;
          const image = productImageFromObject(o);
          const price = extractPriceFromOffers(o.offers);
          const category =
            typeof o.category === "string" && o.category.trim()
              ? o.category.trim()
              : undefined;
          return {
            name: name ?? document.title,
            image: image ?? metaContent("og:image") ?? "",
            price: Number.isFinite(price) ? price : undefined,
            category,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Resolve image URL or text from a CSS selector (retailer rules). */
function querySelectorField(sel: string, field: "image" | "text"): string | null {
  if (!sel.trim()) return null;
  const el = document.querySelector(sel);
  if (!el) return null;
  if (field === "image") {
    if (el instanceof HTMLImageElement) return el.currentSrc || el.src || null;
    if (el instanceof HTMLMetaElement) return el.getAttribute("content");
    const img = el.querySelector("img");
    if (img instanceof HTMLImageElement) return img.currentSrc || img.src || null;
    return el.getAttribute("src") || el.getAttribute("content");
  }
  return el.textContent?.trim() ?? null;
}

function isAmazonHostname(hostname: string): boolean {
  return /(^|\.)amazon\./i.test(hostname);
}

/** PDP main image when JSON-LD / og:image are empty (SPA timing). */
function amazonDomImageFallback(): string | null {
  const selectors = ["#landingImage", "#imgTagWrapperId img", "#main-image-container img"];
  for (const sel of selectors) {
    const v = querySelectorField(sel, "image");
    if (v?.trim()) return v.trim();
  }
  return null;
}

export function hostnameMatchesRule(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function pickRulesForHost(hostname: string, rules: CatalogRule[]): CatalogRule[] {
  return [...rules]
    .filter((r) => r.domain && hostnameMatchesRule(hostname, r.domain))
    .sort((a, b) => a.priority - b.priority);
}

function mergeRuleSelectors(base: ProductPayload, rule: CatalogRule): ProductPayload {
  const cfg = rule.selector_config;
  if (!cfg || typeof cfg !== "object") return base;
  const out: ProductPayload = { ...base };
  const imgSel = typeof cfg.image === "string" ? cfg.image : "";
  const nameSel = typeof cfg.name === "string" ? cfg.name : "";
  const priceSel = typeof cfg.price === "string" ? cfg.price : "";
  if (!out.image.trim() && imgSel) {
    const v = querySelectorField(imgSel, "image");
    if (v) out.image = v;
  }
  if ((!out.name || out.name === document.title) && nameSel) {
    const v = querySelectorField(nameSel, "text");
    if (v) out.name = v;
  }
  if (out.price == null && priceSel) {
    const raw = querySelectorField(priceSel, "text");
    if (raw) {
      const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n)) out.price = n;
    }
  }
  return out;
}

/** JSON-LD + OG + generic price heuristics (no DB rules). */
export function detectProductBase(): ProductPayload {
  const ld = parseJsonLdProduct();
  const url = window.location.href;
  const name = ld?.name ?? metaContent("og:title") ?? document.title;
  const image = ld?.image ?? metaContent("og:image") ?? "";
  const brand = metaContent("og:site_name") ?? undefined;
  const isAmazon = /(^|\.)amazon\./i.test(window.location.hostname);
  const priceText =
    (isAmazon ? textContent("#corePrice_feature_div .a-price .a-offscreen") : null) ??
    textContent("[itemprop=price]") ??
    textContent("[data-test=product-price]");
  const price = priceText ? Number.parseFloat(priceText.replace(/[^0-9.]/g, "")) : ld?.price;
  return {
    url,
    name,
    image,
    brand,
    price: Number.isFinite(price) ? price : undefined,
    category: ld?.category,
  };
}

function getCatalogRulesFromBackground(): Promise<{ rules: CatalogRule[]; stale?: boolean }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "mirror:getCatalogRules" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ rules: [] });
        return;
      }
      const rules = Array.isArray((response as { rules?: unknown })?.rules)
        ? ((response as { rules: CatalogRule[] }).rules ?? [])
        : [];
      resolve({ rules, stale: (response as { stale?: boolean })?.stale });
    });
  });
}

export async function detectProductWithCatalogRules(): Promise<ProductPayload> {
  let base = detectProductBase();
  const zara = parseZaraProduct();
  if (zara) {
    base = {
      ...base,
      url: zara.url,
      name: zara.name.trim() || base.name,
      image: zara.image.trim() || base.image,
      brand: zara.brand ?? base.brand,
      price: zara.price ?? base.price,
      category: zara.category ?? base.category,
    };
  }
  const { rules } = await getCatalogRulesFromBackground();
  const hostname = window.location.hostname;
  for (const rule of pickRulesForHost(hostname, rules)) {
    base = mergeRuleSelectors(base, rule);
  }
  if (isAmazonHostname(hostname) && !base.image.trim()) {
    const fb = amazonDomImageFallback();
    if (fb) base = { ...base, image: fb };
  }
  if (!base.image.trim()) {
    const og = metaContent("og:image");
    if (og) base = { ...base, image: og };
  }
  return { ...base, image: normalizeProductImageUrl(base.image) };
}

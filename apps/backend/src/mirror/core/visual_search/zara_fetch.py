"""Server-side Zara PDP fetch when client-extracted `products.name` is noisy."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import httpx
from selectolax.parser import HTMLParser
from supabase import Client

from mirror.core.visual_search.zara_query import extract_slug_and_code_from_url

_REQUEST_TIMEOUT = httpx.Timeout(8.0, connect=5.0)
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

_NOISE_RE = re.compile(
    r"(zara\s+(united states|usa|uk|men|women|kids)|fashion\s+20\d{2})",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ZaraParsed:
    name: str
    image_url: str
    product_code: str | None
    slug: str | None


def looks_like_zara_noise_title(name: str) -> bool:
    n = name.strip()
    if not n:
        return True
    low = n.lower()
    if _NOISE_RE.search(low):
        return True
    return "|" in n and "zara" in low


def _humanize_slug(slug: str) -> str:
    parts = [p for p in re.split(r"[^a-z0-9]+", slug.lower()) if p]
    if not parts:
        return ""
    return " ".join(w[:1].upper() + w[1:] for w in parts)


def _best_img_from_srcset(srcset: str) -> str | None:
    best_u = ""
    best_px = -1.0
    for chunk in srcset.split(","):
        bits = chunk.strip().split()
        if not bits:
            continue
        url = bits[0]
        desc = bits[1].lower() if len(bits) > 1 else ""
        px = 0.0
        if desc.endswith("w"):
            px = float(desc[:-1] or 0)
        elif desc.endswith("x"):
            px = float(desc[:-1] or 0) * 1000
        if url and px >= best_px:
            best_px = px
            best_u = url
    return best_u.strip() or None


def parse_zara_html(html: str, page_url: str) -> ZaraParsed | None:
    slug, code = extract_slug_and_code_from_url(page_url)
    tree = HTMLParser(html)

    name = ""
    n1 = tree.css_first("h1[data-qa-qualifier='product-detail-info-header']")
    n2 = tree.css_first("h1.product-detail-info__header-name")
    for node in (n1, n2):
        if node is not None:
            t = node.text(strip=True)
            if t:
                name = t
                break

    if not name and slug:
        name = _humanize_slug(slug)

    img_el = tree.css_first("picture.media-image img") or tree.css_first(".media-image img")
    image_url = ""
    if img_el is not None:
        attrs = getattr(img_el, "attributes", None) or {}
        srcset = str(attrs.get("srcset", "") or "")
        if srcset.strip():
            image_url = _best_img_from_srcset(srcset) or ""
        if not image_url:
            image_url = str(attrs.get("src", "") or "").strip()

    if not name and not image_url:
        return None

    return ZaraParsed(
        name=name or _humanize_slug(slug or "") or "Zara product",
        image_url=image_url,
        product_code=code,
        slug=slug,
    )


async def fetch_zara_product(page_url: str) -> ZaraParsed | None:
    headers = {"User-Agent": _USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT, follow_redirects=True) as client:
        try:
            response = await client.get(page_url, headers=headers)
        except httpx.HTTPError:
            return None
    if response.status_code >= 400:
        return None
    return parse_zara_html(response.text, str(response.url))


async def maybe_refresh_zara_product(sb: Client, product: dict[str, Any]) -> dict[str, Any]:
    """If this row looks like a Zara PDP with a bad title, re-fetch and update Supabase."""
    url = str(product.get("canonical_url") or "")
    if "zara.com" not in url.lower():
        return product

    name = str(product.get("name") or "")
    if not looks_like_zara_noise_title(name):
        return product

    parsed = await fetch_zara_product(url)
    if not parsed:
        return product

    pid = str(product["id"])
    upd: dict[str, Any] = {
        "name": parsed.name,
        "brand": "Zara",
    }
    if parsed.image_url.strip():
        upd["primary_image_url"] = parsed.image_url.strip()

    sb.table("products").update(upd).eq("id", pid).execute()

    return {**product, **upd}
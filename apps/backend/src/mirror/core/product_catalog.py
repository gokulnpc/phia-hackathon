"""Service-role product upsert by page URL + client-extracted fields (catalog / closet)."""

from __future__ import annotations

import hashlib
import uuid
from typing import Any


def _coerce_top_bottom_category(extracted: dict[str, Any]) -> str:
    """Map client hints to DB `products.category` closet buckets: only `top` or `bottom`."""
    raw = extracted.get("category")
    s = raw.strip().lower() if isinstance(raw, str) else ""
    if s == "bottom" or "pant" in s or "trouser" in s:
        return "bottom"
    return "top"


def _category_hint_present(extracted: dict[str, Any]) -> bool:
    return "category" in extracted and extracted.get("category") is not None


def upsert_product_from_extracted(sb: Any, url: str, extracted: dict[str, Any]) -> dict[str, Any]:
    """Insert or reuse a product row keyed by canonical_url_hash. Returns the full product row."""
    h = hashlib.sha256(url.encode()).hexdigest()
    name = str(extracted.get("name") or "Product")
    image = str(extracted.get("image") or url)
    brand = str(extracted.get("brand") or "")
    price = extracted.get("price")
    price_usd = float(price) if isinstance(price, (int, float)) else None
    coerced = _coerce_top_bottom_category(extracted)

    existing = sb.table("products").select("id").eq("canonical_url_hash", h).limit(1).execute()
    rows = existing.data or []
    if rows:
        pid = str(rows[0]["id"])
        if _category_hint_present(extracted):
            sb.table("products").update({"category": coerced}).eq("id", pid).execute()
    else:
        pid = str(uuid.uuid4())
        sb.table("products").insert(
            {
                "id": pid,
                "canonical_url": url,
                "canonical_url_hash": h,
                "name": name,
                "brand": brand or None,
                "primary_image_url": image,
                "fingerprint": h[:32],
                "price_usd": price_usd,
                "category": coerced,
            }
        ).execute()
    prod = sb.table("products").select("*").eq("id", pid).single().execute()
    row = prod.data
    if not isinstance(row, dict):
        msg = "product row missing after upsert"
        raise RuntimeError(msg)
    return dict(row)

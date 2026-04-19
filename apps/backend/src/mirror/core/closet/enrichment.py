"""Service helpers for the closet-item enrichment pipeline.

`enqueue_enrichment` is called by the closet save handlers (idempotent — if a
non-terminal job already exists for the item we don't stack duplicates).
`load_image_for_enrichment` fetches the primary image bytes for the worker.
"""

from __future__ import annotations

from typing import Any

import httpx

from mirror.core.errors import ProviderError


def enqueue_enrichment(sb: Any, user_id: str, closet_item_id: str) -> str | None:
    """Insert a queued enrichment job for the given closet_item.

    Returns the inserted job id, or None if we skipped because a queued/processing
    job already exists (duplicate-save case). Intentionally tolerant of errors so
    enrichment never blocks the closet save; the worker can also backfill later.
    """
    try:
        existing = (
            sb.table("closet_enrichment_jobs")
            .select("id")
            .eq("closet_item_id", closet_item_id)
            .in_("status", ["queued", "processing"])
            .limit(1)
            .execute()
        )
        if existing.data:
            return None
        ins = (
            sb.table("closet_enrichment_jobs")
            .insert(
                {
                    "closet_item_id": closet_item_id,
                    "user_id": user_id,
                }
            )
            .execute()
        )
        rows = ins.data or []
        if rows and isinstance(rows[0], dict) and "id" in rows[0]:
            return str(rows[0]["id"])
        return None
    except Exception:  # noqa: BLE001 — enrichment is best-effort
        return None


def fetch_closet_item_for_enrichment(sb: Any, closet_item_id: str) -> dict[str, Any] | None:
    """Return {closet_item_id, user_id, product: {...}} or None if row gone/no product."""
    select_cols = (
        "id, user_id, product_id, kind, "
        "products(id, name, brand, category, color, primary_image_url)"
    )
    res = (
        sb.table("closet_items")
        .select(select_cols)
        .eq("id", closet_item_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    row = rows[0]
    product = row.get("products")
    if isinstance(product, list):
        product = product[0] if product else None
    if not isinstance(product, dict):
        return None
    return {
        "closet_item_id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "product": product,
    }


# Hard cap so a misconfigured / abusive retailer CDN can't OOM the worker.
# ~3 MB covers well above typical PDP hero photos (JPEGs usually 300-800 KB,
# WebP smaller); bigger than that is almost always a print-quality asset we
# don't need for person detection or perceptual hashing.
MAX_IMAGE_DOWNLOAD_BYTES = 3 * 1024 * 1024


async def download_image_bytes(
    image_url: str, *, max_bytes: int = MAX_IMAGE_DOWNLOAD_BYTES
) -> tuple[bytes, str]:
    """Fetch raw bytes for a product image; return (bytes, mime_type).

    Streams the response and aborts once `max_bytes` is exceeded, so a
    retailer CDN returning a 100 MB asset can't stall or OOM the caller.
    """
    if not image_url.strip():
        raise ProviderError("STORAGE_DOWNLOAD_FAILED", "Empty image URL")
    async with (
        httpx.AsyncClient(timeout=30.0, follow_redirects=True) as hc,
        hc.stream("GET", image_url) as r,
    ):
        r.raise_for_status()
        mime = (
            r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            or "image/jpeg"
        )
        chunks: list[bytes] = []
        total = 0
        async for chunk in r.aiter_bytes():
            total += len(chunk)
            if total > max_bytes:
                raise ProviderError(
                    "IMAGE_TOO_LARGE",
                    f"Image at {image_url} exceeds {max_bytes} bytes",
                )
            chunks.append(chunk)
        return b"".join(chunks), mime

"""Build a stable snapshot of a user's owned closet for fit scoring.

The `closet_revision_hash` is deterministic over
  (closet_item_id, updated_at, attributes_version)
sorted by id — so any save, edit, or re-enrichment invalidates the cache without
us having to touch the cache layer explicitly.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

# Top-N most recently updated owned items passed to Gemini. Keep small — cost
# and token budget scale linearly. Closets beyond this bound are handled by
# the v2 vector-shortlist upgrade path.
MAX_OWNED_ITEMS = 20


@dataclass(frozen=True)
class OwnedSnapshot:
    items: list[dict[str, Any]]
    revision_hash: str

    @property
    def count(self) -> int:
        return len(self.items)


def _coerce_owned_row(row: dict[str, Any]) -> dict[str, Any] | None:
    """Flatten Supabase JOIN row into the plain dict the scorer expects."""
    product = row.get("products")
    if isinstance(product, list):
        product = product[0] if product else None
    if not isinstance(product, dict):
        return None
    cid = row.get("id")
    if not isinstance(cid, str):
        return None
    attrs_raw = row.get("attributes")
    attrs = attrs_raw if isinstance(attrs_raw, dict) else None
    return {
        "closet_item_id": cid,
        "updated_at": str(row.get("updated_at") or ""),
        "attributes_version": row.get("attributes_version"),
        "attributes": attrs,
        "name": product.get("name"),
        "brand": product.get("brand"),
        "category": product.get("category"),
        "color": product.get("color"),
        "primary_image_url": product.get("primary_image_url"),
    }


def compute_revision_hash(items: list[dict[str, Any]]) -> str:
    """Stable SHA-256 of (id | updated_at | attributes_version) sorted by id."""
    tokens = sorted(
        f"{it['closet_item_id']}|{it.get('updated_at', '')}|{it.get('attributes_version') or 0}"
        for it in items
    )
    h = hashlib.sha256()
    for tok in tokens:
        h.update(tok.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def fetch_owned_snapshot(sb: Any, user_id: str, *, limit: int = MAX_OWNED_ITEMS) -> OwnedSnapshot:
    res = (
        sb.table("closet_items")
        .select(
            "id, updated_at, attributes, attributes_version, "
            "products(id, name, brand, category, color, primary_image_url)"
        )
        .eq("user_id", user_id)
        .eq("kind", "owned")
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    items: list[dict[str, Any]] = []
    for raw in rows:
        coerced = _coerce_owned_row(raw)
        if coerced:
            items.append(coerced)
    return OwnedSnapshot(items=items, revision_hash=compute_revision_hash(items))

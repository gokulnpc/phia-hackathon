"""Map product metadata category to Fash AI / editorial garment bucket strings."""

from __future__ import annotations

from typing import Any


def fashn_category_from_metadata(meta: dict[str, Any]) -> str:
    """Same mapping as tryon_worker._fashn_category — tops, bottoms, one-pieces, auto."""
    c = meta.get("category")
    if not isinstance(c, str):
        return "auto"
    key = c.strip().lower()
    mapping: dict[str, str] = {
        "top": "tops",
        "tops": "tops",
        "bottom": "bottoms",
        "bottoms": "bottoms",
        "dress": "one-pieces",
        "one-piece": "one-pieces",
        "one-pieces": "one-pieces",
        "outerwear": "tops",
    }
    return mapping.get(key, "auto")

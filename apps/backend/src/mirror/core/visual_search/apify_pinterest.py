"""Apify Pinterest Search → RawVisualMatch (Zara-focused keyword lists)."""

from __future__ import annotations

import asyncio
import math
from typing import Any

import structlog

from mirror.core.config import Settings, get_settings
from mirror.core.visual_search.apify_client import run_sync_get_dataset_items
from mirror.core.visual_search.interface import RawVisualMatch
from mirror.core.visual_search.zara_query import ZaraQueries

_MAX_QUERIES_PER_JOB = 4

_log = structlog.get_logger()


def _num(v: Any) -> float:
    if isinstance(v, (int, float)) and math.isfinite(float(v)):
        return float(v)
    return 0.0


# Image-size keys epctex's Pinterest actor nests under `images`, ordered
# largest → smallest. Prefer `orig` when the actor exposes it (highest res).
_EPCTEX_IMAGE_SIZES = ("orig", "736x", "474x", "236x", "170x", "75x75_RS")


def _extract_nested_image_url(images: dict[str, Any]) -> str | None:
    """Resolve highest-resolution URL from an epctex-style `images` nested dict.

    Shape: `{"236x": {"url": "…"}, "474x": {…}, "orig": {"url": "…"}}` —
    different actors expose different subsets of size keys. Walk largest-
    first and fall back to any usable `url` in any child dict if none of
    the known sizes match.
    """
    for size in _EPCTEX_IMAGE_SIZES:
        node = images.get(size)
        if isinstance(node, dict):
            u = node.get("url") or node.get("orig") or node.get("original")
            if isinstance(u, str) and u.strip():
                return u.strip()
    for node in images.values():
        if isinstance(node, dict):
            u = node.get("url") or node.get("orig") or node.get("original")
            if isinstance(u, str) and u.strip():
                return u.strip()
    return None


def _pin_image_url(row: dict[str, Any]) -> str | None:
    for key in ("image", "imageUrl", "image_url", "gridImage", "media", "images"):
        val = row.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, dict):
            # epctex actor nests sizes under `images`; scraperforge actor uses
            # `{"url": "…"}` directly.
            nested = _extract_nested_image_url(val)
            if nested:
                return nested
            u = val.get("url") or val.get("orig") or val.get("original")
            if isinstance(u, str) and u.strip():
                return u.strip()
        if isinstance(val, list) and val:
            first = val[0]
            if isinstance(first, str) and first.strip():
                return first.strip()
            if isinstance(first, dict):
                u = first.get("url")
                if isinstance(u, str) and u.strip():
                    return u.strip()
    return None


def _pin_page_url(row: dict[str, Any]) -> str | None:
    for key in ("url", "link", "pinUrl", "pin_url"):
        v = row.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    for nid_key in ("node_id", "id"):
        nid = row.get(nid_key)
        if isinstance(nid, str) and nid.strip():
            return f"https://www.pinterest.com/pin/{nid.strip()}/"
        if isinstance(nid, int):
            return f"https://www.pinterest.com/pin/{nid}/"
    return None


def _pin_title(row: dict[str, Any]) -> str:
    # epctex exposes `closeup_unified_description` (usually richest) and
    # `description`; scraperforge uses `title` / `gridTitle` / `note`.
    for key in (
        "closeup_unified_description",
        "title",
        "description",
        "gridTitle",
        "note",
    ):
        v = row.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:500]
    return ""


def _build_search_payload(
    actor_id: str, query: str, per_query_limit: int
) -> dict[str, Any]:
    """Return the right input payload for whichever Pinterest actor is wired up.

    Different Apify marketplace actors expose different input shapes:
      - scraperforge~pinterest-search-scraper: `{query, filter, limit}`
      - epctex/pinterest-scraper:              `{search, maxItems, proxy}`

    We detect by substring match on the actor id so switching the
    `APIFY_PINTEREST_ACTOR_ID` env var is a no-code change for the user.
    """
    lowered = actor_id.lower()
    if "epctex" in lowered:
        return {
            "search": query,
            "maxItems": per_query_limit,
            "proxy": {"useApifyProxy": True},
        }
    # Default / scraperforge shape.
    return {
        "query": query,
        "filter": "all",
        "limit": per_query_limit,
    }


def _score_from_engagement(row: dict[str, Any], rank: int, total: int) -> float:
    rc = row.get("reaction_counts")
    reaction_sum = 0.0
    if isinstance(rc, dict):
        reaction_sum = sum(_num(v) for v in rc.values())
    saves = max(
        reaction_sum,
        _num(row.get("saveCount") or row.get("repin_count")),
    )
    if isinstance(row.get("aggregatedPinData"), dict):
        agg = row["aggregatedPinData"]
        if isinstance(agg, dict):
            saves = max(saves, _num(agg.get("aggregatedStats", {}).get("saves")))
    order = 1.0 - (rank / max(total, 1))
    # log1p so huge saves don't dominate completely
    boost = math.log1p(saves + 1.0) / 10.0
    return round(min(1.0, max(0.0, 0.45 * order + 0.55 * min(1.0, boost))), 4)


class ApifyPinterestSearchProvider:
    name = "apify_pinterest"

    def is_available(self, settings: Settings) -> bool:
        return bool(settings.apify_api_token.strip())

    async def lookup(
        self,
        *,
        candidate_image_url: str,  # noqa: ARG002
        candidate_image_bytes: bytes | None,  # noqa: ARG002
        candidate_text_query: str,
        candidate_queries: ZaraQueries | None = None,
        limit: int = 24,
    ) -> list[RawVisualMatch]:
        settings = get_settings()
        actor = settings.apify_pinterest_actor_id.strip()
        timeout = settings.visual_search_composite_per_provider_timeout_s

        # Brand-tuned queries (currently Zara only) give the best results via
        # seasonal boards + reference codes. When no brand tuning is
        # registered for this product, fall back to a single search from the
        # extracted text query so non-tuned brands (Mango, H&M, Uniqlo …)
        # still produce matches instead of a silent empty grid.
        if candidate_queries is not None:
            searches_raw = [
                *candidate_queries.pinterest_boards,
                candidate_queries.pinterest_keyword,
            ]
        else:
            fallback = candidate_text_query.strip()
            if not fallback:
                return []
            searches_raw = [fallback]

        seen_q: set[str] = set()
        searches: list[str] = []
        for s in searches_raw:
            t = s.strip()
            if t and t not in seen_q:
                seen_q.add(t)
                searches.append(t)

        queries = searches[:_MAX_QUERIES_PER_JOB]
        per_query_limit = min(80, max(12, limit * 2))
        call_timeout = max(timeout, 30.0)

        async def _run_query(q: str) -> list[dict[str, Any]]:
            payload = _build_search_payload(actor, q, per_query_limit)
            return await run_sync_get_dataset_items(
                settings,
                actor_id=actor,
                payload=payload,
                timeout_s=call_timeout,
            )

        gathered = (
            await asyncio.gather(
                *[_run_query(q) for q in queries],
                return_exceptions=True,
            )
            if queries
            else []
        )
        all_rows: list[dict[str, Any]] = []
        sub_exceptions: list[str] = []
        for item in gathered:
            if isinstance(item, BaseException):
                sub_exceptions.append(type(item).__name__)
                continue
            all_rows.extend(item)

        if queries and len(sub_exceptions) == len(queries) and not all_rows:
            _log.warning(
                "apify_pinterest_all_parallel_queries_failed",
                error_kinds=sub_exceptions[:8],
            )

        seen_images: set[str] = set()
        rows: list[dict[str, Any]] = []
        for row in all_rows:
            img_key = _pin_image_url(row)
            if not img_key or img_key in seen_images:
                continue
            seen_images.add(img_key)
            rows.append(row)

        matches: list[RawVisualMatch] = []
        total = min(len(rows), limit * 2)
        for rank, row in enumerate(rows[:total]):
            img = _pin_image_url(row)
            link = _pin_page_url(row)
            if not img or not link:
                continue
            matches.append(
                {
                    "image_url": img,
                    "source_url": link,
                    "source_host": "pinterest.com",
                    "title": _pin_title(row),
                    "visual_score": _score_from_engagement(row, rank, total),
                }
            )
            if len(matches) >= limit:
                break
        return matches

"""Merge Apify Pinterest + Apify Instagram + SerpAPI Google Lens for Zara UGC."""

from __future__ import annotations

import asyncio
import re
from typing import Any
from urllib.parse import urlparse

import structlog

from mirror.core.config import Settings, get_settings
from mirror.core.visual_search.apify_instagram import ApifyInstagramHashtagProvider
from mirror.core.visual_search.apify_pinterest import ApifyPinterestSearchProvider
from mirror.core.visual_search.interface import RawVisualMatch
from mirror.core.visual_search.serpapi import SerpAPIProvider
from mirror.core.visual_search.zara_query import ZaraQueries

log = structlog.get_logger()

_HOST_WEIGHT: dict[str, float] = {
    "pinterest.com": 1.0,
    "instagram.com": 0.85,
}

# Hashtag IG is noisy vs Google Lens (PDP image). Down-rank IG; boost Lens before dedupe.
_SOURCE_WEIGHT: dict[str, float] = {
    "apify_pinterest": 1.0,
    "apify_instagram": 0.42,
    "serpapi_lens": 1.22,
}


def _host_weight(host: str) -> float:
    return _HOST_WEIGHT.get(host.lower().removeprefix("www."), 0.6)


def _normalize_image_key(url: str) -> str:
    try:
        p = urlparse(url.strip())
        host = p.netloc.lower().removeprefix("www.")
        path = (p.path or "").rstrip("/")
        if "pinimg.com" in host:
            path = re.sub(r"/\d+x\d+/", "/orig/", path)
        # Google Images thumbnail shards: SerpAPI Lens returns every match on
        # encrypted-tbn{0..3}.gstatic.com with an identical host+path
        # (`/images`). The per-match fingerprint lives in the query param
        # `?q=tbn:<id>`. Without this, ~20 Lens matches collapse to 4 unique
        # keys (one per shard) and most are dropped by composite's dedup.
        if "gstatic.com" in host:
            m = re.search(r"tbn:[A-Za-z0-9_\-]+", p.query or "")
            if m:
                # Collapse tbn0/1/2/3 shards into the same key space — same
                # thumbnail served from any shard should dedup together.
                return f"gstatic.com/{m.group(0)}".lower()
        return f"{host}{path}".lower()
    except Exception:
        return url.strip().lower()


class CompositeProvider:
    """Fan-out to multiple visual providers; dedupe by image URL key."""

    name = "composite"

    def __init__(self) -> None:
        self._pinterest = ApifyPinterestSearchProvider()
        self._instagram = ApifyInstagramHashtagProvider()
        self._lens = SerpAPIProvider()

    def is_available(self, settings: Settings) -> bool:
        return (
            self._pinterest.is_available(settings)
            or self._instagram.is_available(settings)
            or self._lens.is_available(settings)
        )

    async def lookup(
        self,
        *,
        candidate_image_url: str,
        candidate_image_bytes: bytes | None,
        candidate_text_query: str,
        candidate_queries: ZaraQueries | None = None,
        limit: int = 24,
    ) -> list[RawVisualMatch]:
        settings = get_settings()
        timeout = settings.visual_search_composite_per_provider_timeout_s

        async def _run(
            label: str, coro: Any
        ) -> tuple[str, list[RawVisualMatch]]:
            import time

            started = time.perf_counter()
            try:
                out = await asyncio.wait_for(coro, timeout=timeout)
                if isinstance(out, list):
                    log.info(
                        "composite_child_complete",
                        child=label,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        match_count=len(out),
                    )
                    return (label, out)
            except TimeoutError:
                log.warning(
                    "composite_child_timeout",
                    child=label,
                    latency_ms=int((time.perf_counter() - started) * 1000),
                )
            except Exception as exc:
                log.warning(
                    "composite_child_error",
                    child=label,
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    err=str(exc),
                )
            return (label, [])

        tasks: list[Any] = []
        if self._pinterest.is_available(settings):
            tasks.append(
                _run(
                    "apify_pinterest",
                    self._pinterest.lookup(
                        candidate_image_url=candidate_image_url,
                        candidate_image_bytes=candidate_image_bytes,
                        candidate_text_query=candidate_text_query,
                        candidate_queries=candidate_queries,
                        limit=limit,
                    ),
                )
            )
        if self._instagram.is_available(settings):
            tasks.append(
                _run(
                    "apify_instagram",
                    self._instagram.lookup(
                        candidate_image_url=candidate_image_url,
                        candidate_image_bytes=candidate_image_bytes,
                        candidate_text_query=candidate_text_query,
                        candidate_queries=candidate_queries,
                        limit=limit,
                    ),
                )
            )
        if self._lens.is_available(settings):
            tasks.append(
                _run(
                    "serpapi_lens",
                    self._lens.lookup(
                        candidate_image_url=candidate_image_url,
                        candidate_image_bytes=candidate_image_bytes,
                        candidate_text_query=candidate_text_query,
                        candidate_queries=candidate_queries,
                        limit=limit,
                    ),
                )
            )

        labeled = await asyncio.gather(*tasks) if tasks else []
        merged: list[tuple[str, RawVisualMatch]] = []
        for child, part in labeled:
            for m in part:
                merged.append((child, m))

        deduped: dict[str, RawVisualMatch] = {}
        for child, m in merged:
            key = _normalize_image_key(m["image_url"])
            host = m["source_host"]
            w = _host_weight(host)
            sw = _SOURCE_WEIGHT.get(child, 1.0)
            combined = round(
                min(1.0, float(m["visual_score"]) * sw * w),
                4,
            )
            row: RawVisualMatch = {
                "image_url": m["image_url"],
                "source_url": m["source_url"],
                "source_host": m["source_host"],
                "title": m["title"],
                "visual_score": combined,
            }
            prev = deduped.get(key)
            if prev is None or combined > float(prev["visual_score"]):
                deduped[key] = row

        scored = sorted(
            deduped.values(),
            key=lambda x: float(x["visual_score"]),
            reverse=True,
        )
        return scored[:limit]

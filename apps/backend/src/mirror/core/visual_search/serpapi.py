"""SerpAPI Google Lens provider.

Endpoint: GET https://serpapi.com/search.json?engine=google_lens&url=<img>&api_key=<key>
Docs: https://serpapi.com/google-lens-api

Only a thin provider — no caching here (that's the service layer's job), no
person-filter (that's Gemini's job in a later phase). Failures raise
`ProviderError` with `SERPAPI_*` codes so the router / worker can map them
to HTTP statuses consistently.
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

import httpx

from mirror.core.config import Settings
from mirror.core.errors import ProviderError
from mirror.core.visual_search.interface import RawVisualMatch

SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
# 20 s (bumped from 10 s) covers SerpAPI's cold-start p99; Lens on a new
# image can take 8–12 s on the first call. Still well under the worker's
# 120 s end-to-end ceiling. One retry on timeout — this used to be the
# single source of empty-result jobs on the user's smoke test.
REQUEST_TIMEOUT_SECONDS = 20.0
RETRY_ATTEMPTS = 2


def _host_of(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower()
    except ValueError:
        return ""
    return netloc.removeprefix("www.")


def _coerce_match(raw: dict[str, Any], rank: int, total: int) -> RawVisualMatch | None:
    """Project a SerpAPI visual_match into our RawVisualMatch shape. Drops rows
    missing the minimum viable fields (image + source URL)."""
    image = raw.get("thumbnail") or raw.get("image") or raw.get("original")
    source = raw.get("link") or raw.get("source") or raw.get("page")
    if not isinstance(image, str) or not image.strip():
        return None
    if not isinstance(source, str) or not source.strip():
        return None
    title_raw = raw.get("title") or raw.get("snippet") or ""
    title = title_raw.strip() if isinstance(title_raw, str) else ""
    # Order-based score: rank 0 → 1.0, rank N-1 → ~0.0.
    visual_score = 1.0 - (rank / max(total, 1))
    return {
        "image_url": image.strip(),
        "source_url": source.strip(),
        "source_host": _host_of(source),
        "title": title,
        "visual_score": round(max(0.0, min(1.0, visual_score)), 4),
    }


class SerpAPIProvider:
    name = "serpapi"

    def is_available(self, settings: Settings) -> bool:
        return bool(settings.serpapi_api_key.strip())

    async def lookup(
        self,
        *,
        candidate_image_url: str,
        candidate_image_bytes: bytes | None,  # noqa: ARG002  (unused; Lens needs a URL)
        candidate_text_query: str,  # noqa: ARG002  (unused for Lens; kept for interface parity)
        candidate_queries: object | None = None,  # noqa: ARG002
        limit: int = 20,
    ) -> list[RawVisualMatch]:
        from mirror.core.config import get_settings

        settings = get_settings()
        if not candidate_image_url.strip():
            return []
        api_key = settings.serpapi_api_key.strip()
        if not api_key:
            raise ProviderError(
                "SERPAPI_NOT_CONFIGURED", "SERPAPI_API_KEY is not set."
            )
        params = {
            "engine": "google_lens",
            "url": candidate_image_url,
            "api_key": api_key,
        }
        response: httpx.Response | None = None
        last_timeout: httpx.TimeoutException | None = None
        for attempt in range(RETRY_ATTEMPTS):
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    response = await client.get(SERPAPI_ENDPOINT, params=params)
                break  # success
            except httpx.TimeoutException as exc:
                last_timeout = exc
                if attempt + 1 >= RETRY_ATTEMPTS:
                    raise ProviderError(
                        "SERPAPI_TIMEOUT",
                        f"SerpAPI request exceeded {REQUEST_TIMEOUT_SECONDS}s "
                        f"after {RETRY_ATTEMPTS} attempts",
                    ) from exc
                # One short backoff before retrying — SerpAPI is usually warm by now.
                await asyncio.sleep(0.5)
            except httpx.HTTPError as exc:
                raise ProviderError(
                    "SERPAPI_NETWORK_ERROR", f"SerpAPI network error: {exc}"
                ) from exc
        if response is None:
            # Defensive — should be unreachable given the loop structure,
            # but satisfies the type checker + rules out future regressions.
            raise ProviderError(
                "SERPAPI_TIMEOUT",
                f"SerpAPI produced no response after {RETRY_ATTEMPTS} attempts",
            ) from last_timeout

        if response.status_code == 429:
            raise ProviderError(
                "SERPAPI_QUOTA_EXCEEDED",
                "SerpAPI rate/quota limit hit (HTTP 429)",
            )
        if response.status_code >= 400:
            raise ProviderError(
                "SERPAPI_BAD_RESPONSE",
                f"SerpAPI returned HTTP {response.status_code}",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError(
                "SERPAPI_BAD_RESPONSE", "SerpAPI response was not valid JSON"
            ) from exc
        if not isinstance(payload, dict):
            raise ProviderError(
                "SERPAPI_BAD_RESPONSE", "SerpAPI response was not a JSON object"
            )
        # SerpAPI surfaces a structured error under the top-level "error" key.
        err = payload.get("error")
        if isinstance(err, str) and err.strip():
            raise ProviderError("SERPAPI_BAD_RESPONSE", f"SerpAPI error: {err}")

        # Google Lens via SerpAPI populates two arrays with similar shapes:
        # - `visual_matches`: canonical per-page matches (title + link + thumbnail)
        # - `inline_images`: tiles that often surface richer image URLs for the
        #   *same* page. Merging — with visual_matches first so rank-order ties
        #   prefer the canonical row — gives us more candidates for the grid
        #   while the downstream dedup (composite.py) removes duplicates.
        vm = payload.get("visual_matches")
        ii = payload.get("inline_images")
        combined: list[dict[str, Any]] = []
        if isinstance(vm, list):
            combined.extend(r for r in vm if isinstance(r, dict))
        if isinstance(ii, list):
            combined.extend(r for r in ii if isinstance(r, dict))
        if not combined:
            return []

        capped = combined[:limit]
        total = len(capped)
        matches: list[RawVisualMatch] = []
        for rank, raw in enumerate(capped):
            m = _coerce_match(raw, rank, total)
            if m is not None:
                matches.append(m)
        return matches

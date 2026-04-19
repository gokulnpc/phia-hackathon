"""Shared Apify `run-sync-get-dataset-items` HTTP helper."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from mirror.core.config import Settings
from mirror.core.errors import ProviderError

APIFY_API_ROOT = "https://api.apify.com/v2"


async def run_sync_get_dataset_items(
    settings: Settings,
    *,
    actor_id: str,
    payload: dict[str, Any],
    timeout_s: float,
) -> list[dict[str, Any]]:
    """POST run-sync-get-dataset-items — returns dataset items as JSON array."""
    token = settings.apify_api_token.strip()
    if not token:
        raise ProviderError("APIFY_NOT_CONFIGURED", "APIFY_API_TOKEN is not set.")

    safe_actor = quote(actor_id, safe="")
    url = (
        f"{APIFY_API_ROOT}/acts/{safe_actor}/run-sync-get-dataset-items"
        f"?token={token}&clean=true"
    )
    to = httpx.Timeout(timeout_s, connect=min(10.0, timeout_s))
    try:
        async with httpx.AsyncClient(timeout=to) as client:
            response = await client.post(url, json=payload)
    except httpx.TimeoutException as exc:
        raise ProviderError(
            "APIFY_TIMEOUT",
            f"Apify actor exceeded {timeout_s}s",
        ) from exc
    except httpx.HTTPError as exc:
        raise ProviderError("APIFY_NETWORK_ERROR", f"Apify HTTP error: {exc}") from exc

    if response.status_code == 429:
        raise ProviderError(
            "APIFY_QUOTA_EXCEEDED",
            "Apify rate/quota limit hit (HTTP 429)",
        )
    if response.status_code >= 400:
        body = response.text[:500]
        raise ProviderError(
            "APIFY_BAD_RESPONSE",
            f"Apify returned HTTP {response.status_code}: {body}",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError(
            "APIFY_BAD_RESPONSE",
            "Apify response was not valid JSON",
        ) from exc

    if isinstance(data, list):
        rows = [x for x in data if isinstance(x, dict)]
        return rows
    if isinstance(data, dict):
        # Some proxies wrap as { data: [...] }
        inner = data.get("items") or data.get("data")
        if isinstance(inner, list):
            rows = [x for x in inner if isinstance(x, dict)]
            return rows
    return []

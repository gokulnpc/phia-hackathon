"""Fash AI Virtual Try-On v1.6 (direct REST API: /v1/run + /v1/status)."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

from mirror.core.config import Settings
from mirror.core.errors import ProviderError

log = structlog.get_logger()

# Align with extension waitForTryOnJob (see App.tsx timeoutMs).
_POLL_INTERVAL_SEC = 1.0
_POLL_MAX_ITERATIONS = 300
_HTTP_TIMEOUT_SEC = 180.0

FASHN_BASE = "https://api.fashn.ai/v1"


def fashn_output_image_url(result: dict[str, Any]) -> str | None:
    """Normalized shape: {\"images\": [ { \"url\": \"https://...\" } ] }."""
    images = result.get("images")
    if isinstance(images, list) and len(images) > 0:
        first = images[0]
        if isinstance(first, dict):
            u = first.get("url")
            if isinstance(u, str) and u.startswith("http"):
                return u
    return None


def _inputs_payload(
    *,
    model_image: str,
    garment_image: str,
    category: str,
    mode: str,
) -> dict[str, Any]:
    return {
        "model_image": model_image,
        "garment_image": garment_image,
        "category": category,
        "segmentation_free": True,
        "moderation_level": "permissive",
        "garment_photo_type": "auto",
        "mode": mode,
        "seed": 42,
        "num_samples": 1,
        "output_format": "png",
        "return_base64": False,
    }


def _normalize_completed_status(body: dict[str, Any]) -> dict[str, Any]:
    """Build `{images: [{url}]}` from Fash status ``output`` list (shape expected by worker)."""
    out = body.get("output")
    if not isinstance(out, list) or len(out) == 0:
        raise ProviderError("PROVIDER_BAD_RESPONSE", "Missing output in Fash AI status")
    first = out[0]
    if not isinstance(first, str) or not first.startswith("http"):
        raise ProviderError("PROVIDER_BAD_RESPONSE", "Invalid output URL in Fash AI status")
    return {"images": [{"url": first}]}


async def run_fashn_tryon(
    settings: Settings,
    *,
    model_image: str,
    garment_image: str,
    category: str,
    mode: str,
) -> dict[str, Any]:
    """Submit try-on to Fash AI and poll until complete; returns normalized images payload."""
    if not settings.fashn_api_key:
        raise ProviderError("PROVIDER_NOT_CONFIGURED", "FASHN_API_KEY is not set")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.fashn_api_key}",
    }
    body = {
        "model_name": "tryon-v1.6",
        "inputs": _inputs_payload(
            model_image=model_image,
            garment_image=garment_image,
            category=category,
            mode=mode,
        ),
    }
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SEC) as client:
        resp = await client.post(f"{FASHN_BASE}/run", headers=headers, json=body)
        if resp.status_code >= 400:
            log.warning("fashn_submit_failed", status=resp.status_code, body=resp.text[:500])
            raise ProviderError(
                "PROVIDER_SUBMIT_FAILED",
                f"Fash AI returned {resp.status_code}",
            )
        data = resp.json()
    pred_id = data.get("id")
    if not isinstance(pred_id, str):
        raise ProviderError("PROVIDER_BAD_RESPONSE", "Missing id from Fash AI /run")

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SEC) as client:
        poll_headers = {"Authorization": f"Bearer {settings.fashn_api_key}"}
        for _ in range(_POLL_MAX_ITERATIONS):
            st = await client.get(f"{FASHN_BASE}/status/{pred_id}", headers=poll_headers)
            if st.status_code >= 400:
                log.warning("fashn_status_failed", status=st.status_code, body=st.text[:500])
                raise ProviderError(
                    "PROVIDER_SUBMIT_FAILED",
                    f"Fash AI status {st.status_code}",
                )
            sd = st.json()
            status = sd.get("status")
            if status == "completed":
                return _normalize_completed_status(sd)
            if status == "failed":
                err = sd.get("error")
                raise ProviderError("PROVIDER_JOB_FAILED", str(err) if err is not None else str(sd))
            await asyncio.sleep(_POLL_INTERVAL_SEC)

    raise ProviderError("PROVIDER_TIMEOUT", "Fash AI try-on timed out")

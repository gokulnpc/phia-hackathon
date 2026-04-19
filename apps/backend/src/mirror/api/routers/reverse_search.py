"""Reverse search: Mirror-native posts + async external (web) results.

POST enqueues a web-search job when a real provider is configured; the client
receives any Mirror-native posts inline, plus a `job_id` to poll. Cache hits
return web results in the same response with `cache_hit=true`.
"""

from __future__ import annotations

import asyncio
import hashlib
import uuid
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import Client

from mirror.core.auth import AuthUser, require_user
from mirror.core.config import get_settings
from mirror.core.product_catalog import upsert_product_from_extracted
from mirror.core.visual_search.providers import get_provider
from mirror.core.visual_search.service import (
    enqueue_web_results_job,
    fetch_job,
    fetch_mirror_results,
    find_cached_web_results,
)
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()
router = APIRouter(prefix="/reverse-search", tags=["reverse-search"])


def _client() -> Client:
    return create_service_client(get_settings())


def _trace(request: Request) -> str:
    tid = request.headers.get("x-trace-id")
    if isinstance(tid, str) and tid.strip():
        return tid.strip()
    return str(uuid.uuid4())


def _resolve_canonical_url_hash(body: dict[str, Any]) -> str:
    """Accept either a precomputed `canonical_url_hash` or a `url` to hash."""
    h = body.get("canonical_url_hash")
    if isinstance(h, str) and h.strip():
        return h.strip()
    url = body.get("url")
    if isinstance(url, str) and url.strip():
        return hashlib.sha256(url.strip().encode()).hexdigest()
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail={
            "error": {
                "code": "VALIDATION_URL_REQUIRED",
                "message": "url or canonical_url_hash required",
            }
        },
    )


def _lookup_product_id(sb: Client, canonical_url_hash: str) -> str | None:
    res = (
        sb.table("products")
        .select("id")
        .eq("canonical_url_hash", canonical_url_hash)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    pid = rows[0].get("id")
    return str(pid) if isinstance(pid, str) else None


def _enqueue_or_cache_hit(
    sb: Client,
    *,
    user_id: str,
    canonical_url_hash: str,
) -> dict[str, Any]:
    """Resolve the external-results path for this request.

    Returns a dict with one of three shapes:
      - {"disabled": True}                           — provider not configured
      - {"cache_hit": True, "web_results": [...]}    — fresh cache row found
      - {"cache_hit": False, "job_id": "...", "provider": "..."}  — job enqueued
    """
    settings = get_settings()
    provider = get_provider(settings)
    if not provider.is_available(settings):
        return {"disabled": True}

    cached = find_cached_web_results(
        sb, canonical_url_hash=canonical_url_hash, provider=provider.name
    )
    if cached is not None:
        web = cached.get("web_results")
        return {
            "cache_hit": True,
            "web_results": web if isinstance(web, list) else [],
        }

    product_id = _lookup_product_id(sb, canonical_url_hash)
    jid = enqueue_web_results_job(
        sb,
        user_id=user_id,
        product_id=product_id,
        canonical_url_hash=canonical_url_hash,
        provider=provider.name,
    )
    return {"cache_hit": False, "job_id": jid, "provider": provider.name}


@router.post("")
async def submit(
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> Any:
    trace = _trace(request)
    structlog.contextvars.bind_contextvars(trace_id=trace, user_id_hash=user.sub[:8])

    canonical_hash = _resolve_canonical_url_hash(body)
    sb = _client()

    # Upsert the `products` row from the PDP metadata the extension scraped.
    # Without this, fresh PDPs (never saved to closet) reach the worker with a
    # NULL `primary_image_url` — SerpAPI Lens short-circuits on empty image
    # URL and the brand-tuning Apify providers have nothing to key off of,
    # producing zero results silently.
    url_for_upsert = body.get("url")
    extracted_raw = body.get("extracted")
    if (
        isinstance(url_for_upsert, str)
        and url_for_upsert.strip()
        and isinstance(extracted_raw, dict)
    ):
        try:
            await asyncio.to_thread(
                upsert_product_from_extracted,
                sb,
                url_for_upsert.strip(),
                extracted_raw,
            )
        except Exception as exc:  # noqa: BLE001 — upsert is best-effort
            log.warning("reverse_search_product_upsert_failed", err=str(exc))

    try:
        mirror_results = await asyncio.to_thread(
            fetch_mirror_results, sb, canonical_hash
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("reverse_search_mirror_error", err=str(exc))
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "INTERNAL",
                    "message": "Could not fetch Mirror-native results",
                }
            },
        ) from exc

    try:
        external = await asyncio.to_thread(
            _enqueue_or_cache_hit,
            sb,
            user_id=user.sub,
            canonical_url_hash=canonical_hash,
        )
        log.info(
            "reverse_search_submit_external",
            trace_id=trace,
            cache_hit=bool(external.get("cache_hit")),
            external_disabled=bool(external.get("disabled")),
            job_enqueued=bool(external.get("job_id")),
            provider=str(external.get("provider") or ""),
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("reverse_search_enqueue_error", err=str(exc))
        # Mirror-native results are still useful — return them with an empty
        # web_results + a soft error flag rather than a hard 500.
        return {
            "status": "completed",
            "cache_hit": False,
            "canonical_url_hash": canonical_hash,
            "mirror_results": mirror_results,
            "web_results": [],
            "external_provider_error": "ENQUEUE_FAILED",
        }

    response: dict[str, Any] = {
        "canonical_url_hash": canonical_hash,
        "mirror_results": mirror_results,
    }
    if external.get("disabled"):
        response.update(
            status="completed",
            cache_hit=False,
            web_results=[],
            external_disabled=True,
        )
        return response
    if external.get("cache_hit"):
        response.update(
            status="completed",
            cache_hit=True,
            web_results=external.get("web_results") or [],
        )
        return response
    response.update(
        status="queued",
        cache_hit=False,
        web_results=[],
        job_id=external["job_id"],
        provider=external.get("provider"),
    )
    return response


@router.get("/{job_id}")
async def poll(
    job_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
) -> Any:
    _trace(request)
    sb = _client()
    out = await asyncio.to_thread(fetch_job, sb, user_id=user.sub, job_id=job_id)
    if out is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": "Job not found"}},
        )
    return out

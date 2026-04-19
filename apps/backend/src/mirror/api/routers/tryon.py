from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from supabase import Client

from mirror.core.auth import AuthUser, require_user
from mirror.core.config import get_settings
from mirror.core.errors import MirrorError, TryOnError, ValidationError
from mirror.core.tryon_logic import (
    enqueue_tryon_editorial_job,
    enqueue_tryon_job,
    error_response,
    find_cached_result,
    get_active_reference_photo,
    get_owned_tryon_result_for_model_ref,
    get_product_primary_image_url,
    parse_model_reference_tryon_result_id,
    parse_tryon_request,
    product_image_hash,
    signed_tryon_urls,
)
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()
router = APIRouter(prefix="/tryon", tags=["tryon"])


def _client() -> Client:
    return create_service_client(get_settings())


def _trace(request: Request) -> str:
    tid = request.headers.get("x-trace-id")
    if isinstance(tid, str) and tid.strip():
        return tid.strip()
    return str(uuid.uuid4())


@router.post("")
async def submit_tryon(
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> Any:
    trace = _trace(request)
    structlog.contextvars.bind_contextvars(trace_id=trace, user_id_hash=user.sub[:8])
    try:
        product_id, image_url_in, meta, mode, priority = parse_tryon_request(body)
        client = _client()
        resolved_url = image_url_in
        if resolved_url is None and product_id:
            resolved_url = await asyncio.to_thread(
                get_product_primary_image_url, client, product_id
            )
        assert resolved_url is not None
        ref = await asyncio.to_thread(get_active_reference_photo, client, user.sub)
        h = product_image_hash(resolved_url)
        model_ref_rid = parse_model_reference_tryon_result_id(body)
        if model_ref_rid is not None:
            await asyncio.to_thread(
                get_owned_tryon_result_for_model_ref,
                client,
                user_id=user.sub,
                result_id=model_ref_rid,
            )
        cached = (
            None
            if model_ref_rid is not None
            else await asyncio.to_thread(find_cached_result, client, user.sub, h)
        )
        if cached:
            sm, st, exp = await asyncio.to_thread(signed_tryon_urls, client, cached)
            return {
                "job_id": f"cached-{cached['id']}",
                "status": "completed",
                "cache_hit": True,
                "result": {
                    "id": cached["id"],
                    "signed_url": sm,
                    "thumbnail_url": st,
                    "quality_score": float(cached["quality_score"]),
                    "provider": cached["provider"],
                    "generated_at": cached["generated_at"],
                    "signed_url_expires_at": exp.isoformat(),
                },
            }
        jid = await asyncio.to_thread(
            enqueue_tryon_job,
            client,
            user_id=user.sub,
            product_id=product_id,
            product_image_url=resolved_url,
            product_metadata=meta,
            mode=mode,
            priority=priority,
            reference_photo_id=str(ref["id"]),
            model_reference_tryon_result_id=model_ref_rid,
        )
        est = datetime.now(UTC).isoformat()
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "job_id": jid,
                "status": "queued",
                "cache_hit": False,
                "estimated_ready_at": est,
                "poll_url": f"/api/v1/tryon/{jid}",
            },
        )
    except MirrorError as e:
        log.warning("tryon_submit_error", code=e.code, err=str(e))
        if isinstance(e, TryOnError) and e.code == "TRYON_NO_AVATAR":
            raise HTTPException(
                status.HTTP_412_PRECONDITION_FAILED, error_response(e.code, str(e), trace)
            ) from e
        if isinstance(e, TryOnError) and e.code == "TRYON_CONSENT_EXPIRED":
            raise HTTPException(
                status.HTTP_412_PRECONDITION_FAILED, error_response(e.code, str(e), trace)
            ) from e
        if isinstance(e, ValidationError):
            if e.code in ("NOT_FOUND_PRODUCT", "NOT_FOUND_TRYON_RESULT"):
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND, error_response(e.code, str(e), trace)
                ) from e
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, error_response(e.code, str(e), trace)
            ) from e
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, error_response(e.code, str(e), trace)
        ) from e


@router.post("/editorial")
async def submit_tryon_editorial(
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> Any:
    trace = _trace(request)
    structlog.contextvars.bind_contextvars(trace_id=trace, user_id_hash=user.sub[:8])
    raw = body.get("source_result_id")
    if not isinstance(raw, str) or not raw.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            error_response("VALIDATION_BAD_REQUEST", "source_result_id is required", trace),
        )
    source_result_id = raw.strip()
    try:
        jid = await asyncio.to_thread(
            enqueue_tryon_editorial_job,
            _client(),
            user_id=user.sub,
            source_tryon_result_id=source_result_id,
        )
        est = datetime.now(UTC).isoformat()
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "job_id": jid,
                "status": "queued",
                "estimated_ready_at": est,
                "poll_url": f"/api/v1/tryon/editorial/{jid}",
            },
        )
    except MirrorError as e:
        log.warning("tryon_editorial_submit_error", code=e.code, err=str(e))
        if isinstance(e, ValidationError):
            if e.code == "NOT_FOUND_TRYON_RESULT":
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND, error_response(e.code, str(e), trace)
                ) from e
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, error_response(e.code, str(e), trace)
            ) from e
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, error_response(e.code, str(e), trace)
        ) from e


@router.get("/editorial/{job_id}")
async def get_tryon_editorial_job(
    job_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
) -> Any:
    trace = _trace(request)
    client = _client()
    res = (
        client.table("tryon_editorial_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user.sub)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, error_response("NOT_FOUND", "Job not found", trace)
        )
    job = rows[0]
    out: dict[str, Any] = {
        "job_id": job_id,
        "status": job["status"],
    }
    if job["status"] == "completed" and job.get("output_tryon_result_id"):
        rres = (
            client.table("tryon_results")
            .select("*")
            .eq("id", job["output_tryon_result_id"])
            .limit(1)
            .execute()
        )
        rrows = rres.data or []
        if rrows:
            row = rrows[0]
            sm, st, _ = signed_tryon_urls(client, row)
            out["result"] = {
                "id": row["id"],
                "signed_url": sm,
                "thumbnail_url": st,
                "quality_score": float(row["quality_score"]),
                "provider": row["provider"],
                "generated_at": row["generated_at"],
            }
    elif job["status"] == "failed":
        out["error_code"] = job.get("error_code")
        out["error_message"] = job.get("error_message")
    return out


@router.get("/{job_id}")
async def get_tryon_job(
    job_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
) -> Any:
    trace = _trace(request)
    client = _client()
    if job_id.startswith("cached-"):
        rid = job_id.removeprefix("cached-")
        res = (
            client.table("tryon_results")
            .select("*")
            .eq("id", rid)
            .eq("user_id", user.sub)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, error_response("NOT_FOUND", "Result not found", trace)
            )
        row = rows[0]
        sm, st, _ = signed_tryon_urls(client, row)
        return {
            "job_id": job_id,
            "status": "completed",
            "result": {
                "id": row["id"],
                "signed_url": sm,
                "thumbnail_url": st,
                "quality_score": float(row["quality_score"]),
                "provider": row["provider"],
                "generated_at": row["generated_at"],
            },
        }
    res = (
        client.table("tryon_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user.sub)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, error_response("NOT_FOUND", "Job not found", trace)
        )
    job = rows[0]
    out: dict[str, Any] = {
        "job_id": job_id,
        "status": job["status"],
        "attempts": job["attempts"],
        "provider": job.get("provider"),
    }
    if job["status"] == "completed" and job.get("result_id"):
        rres = (
            client.table("tryon_results").select("*").eq("id", job["result_id"]).limit(1).execute()
        )
        rrows = rres.data or []
        if rrows:
            row = rrows[0]
            sm, st, _ = signed_tryon_urls(client, row)
            out["result"] = {
                "id": row["id"],
                "signed_url": sm,
                "thumbnail_url": st,
                "quality_score": float(row["quality_score"]),
                "provider": row["provider"],
                "generated_at": row["generated_at"],
            }
    elif job["status"] == "failed":
        out["error_code"] = job.get("error_code")
        out["error_message"] = job.get("error_message")
    return out

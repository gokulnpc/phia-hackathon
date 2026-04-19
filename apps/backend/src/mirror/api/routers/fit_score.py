"""Fit score: POST enqueue, GET poll. Mirrors the try-on router's contract."""

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
from mirror.core.fit_score.service import fetch_job_with_result, submit_fit_score
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()
router = APIRouter(prefix="/fit-score", tags=["fit-score"])


def _client() -> Client:
    return create_service_client(get_settings())


def _trace(request: Request) -> str:
    tid = request.headers.get("x-trace-id")
    if isinstance(tid, str) and tid.strip():
        return tid.strip()
    return str(uuid.uuid4())


@router.post("")
async def submit(
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> Any:
    trace = _trace(request)
    structlog.contextvars.bind_contextvars(trace_id=trace, user_id_hash=user.sub[:8])

    url = body.get("url")
    if not isinstance(url, str) or not url.strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "VALIDATION_URL_REQUIRED", "message": "url required"}},
        )
    extracted = body.get("extracted")
    if not isinstance(extracted, dict):
        extracted = {}

    sb = _client()
    try:
        outcome = await asyncio.to_thread(
            submit_fit_score,
            sb,
            user_id=user.sub,
            url=url.strip(),
            extracted=extracted,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("fit_score_submit_error", err=str(exc))
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "INTERNAL", "message": "Could not submit fit score"}},
        ) from exc

    if outcome.status == "empty_closet":
        return {
            "status": "empty_closet",
            "cache_hit": False,
            "cta": outcome.cta,
        }
    if outcome.status == "completed" and outcome.cache_hit:
        return {
            "job_id": outcome.job_id,
            "status": "completed",
            "cache_hit": True,
            "result": outcome.result,
        }
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "job_id": outcome.job_id,
            "status": "queued",
            "cache_hit": False,
            "estimated_ready_at": datetime.now(UTC).isoformat(),
            "poll_url": f"/api/v1/fit-score/{outcome.job_id}",
        },
    )


@router.get("/{job_id}")
async def poll(
    job_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(require_user)],
) -> Any:
    _trace(request)
    sb = _client()
    out = await asyncio.to_thread(fetch_job_with_result, sb, user_id=user.sub, job_id=job_id)
    if out is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": "Job not found"}},
        )
    return out

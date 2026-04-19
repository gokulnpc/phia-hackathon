"""Polls fit_score_jobs with SKIP LOCKED; Gemini → fit_score_results."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import asyncpg
import structlog
from supabase import Client

from mirror.core.closet.enrichment import download_image_bytes
from mirror.core.config import Settings, get_settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.core.fit_score.closet_snapshot import (
    compute_revision_hash,
    fetch_owned_snapshot,
)
from mirror.integrations.gemini_fit_score import PROMPT_VERSION, score_wardrobe_fit
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()

CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM fit_score_jobs
  WHERE status = 'queued'
  ORDER BY priority ASC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE fit_score_jobs j
SET
  status = 'processing',
  locked_at = now(),
  started_at = COALESCE(j.started_at, now())
FROM cte
WHERE j.id = cte.id
RETURNING j.*;
"""


async def claim_job(pool: asyncpg.Pool) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        return await conn.fetchrow(CLAIM_SQL)


def _job_metadata(job: asyncpg.Record) -> dict[str, Any]:
    raw = job.get("product_metadata")
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        import json

        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    user_id = str(job["user_id"])
    structlog.contextvars.bind_contextvars(trace_id=str(job["trace_id"]), job_id=job_id)

    meta = _job_metadata(job)
    product_image_url = str(meta.get("primary_image_url") or "").strip()
    candidate = {
        "name": meta.get("name"),
        "brand": meta.get("brand"),
        "category": meta.get("category"),
        "color": meta.get("color"),
        "price_usd": meta.get("price_usd"),
    }
    product_fingerprint = str(job["product_fingerprint"])
    job_revision = str(job["closet_revision_hash"])

    # Re-snapshot the closet at processing time so the worker sees the latest
    # enrichment (an enrichment job may have finished between enqueue and claim).
    snapshot = await asyncio.to_thread(fetch_owned_snapshot, sb, user_id)
    if snapshot.count == 0:
        await fail_job(pool, job_id, "CLOSET_EMPTY", "No owned items to score against")
        return

    # Download candidate image (best-effort; scoring degrades gracefully without it).
    candidate_bytes: bytes | None = None
    candidate_mime = "image/jpeg"
    if product_image_url:
        try:
            candidate_bytes, candidate_mime = await download_image_bytes(product_image_url)
        except Exception as exc:  # noqa: BLE001
            log.warning("fit_score_candidate_download_failed", err=str(exc))
            candidate_bytes = None

    try:
        scored = await score_wardrobe_fit(
            settings,
            candidate_image_bytes=candidate_bytes,
            candidate_mime=candidate_mime,
            candidate=candidate,
            owned_items=snapshot.items,
        )
    except ValidationError as exc:
        await fail_job(pool, job_id, exc.code, str(exc))
        return
    except ProviderError as exc:
        await fail_job(pool, job_id, exc.code, str(exc)[:500])
        return
    except Exception as exc:  # noqa: BLE001
        log.exception("fit_score_gemini_error", err=str(exc))
        await fail_job(pool, job_id, "PROVIDER_ERROR", str(exc)[:500])
        return

    # If the closet changed mid-flight, use the current snapshot's revision for
    # the cache row (so re-runs against the newer closet hit the cache cleanly).
    live_revision = snapshot.revision_hash
    if live_revision != job_revision:
        log.info(
            "fit_score_revision_drift",
            job_revision=job_revision,
            live_revision=live_revision,
        )

    result_id = str(uuid.uuid4())
    ins = (
        sb.table("fit_score_results")
        .insert(
            {
                "id": result_id,
                "job_id": job_id,
                "user_id": user_id,
                "product_id": str(job["product_id"]) if job["product_id"] is not None else None,
                "product_fingerprint": product_fingerprint,
                "closet_revision_hash": live_revision,
                "prompt_version": PROMPT_VERSION,
                "overall_score": int(scored["overall_score"]),
                "breakdown": scored["breakdown"],
                "matching_items": scored["matching_items"],
                "conflicts": scored["conflicts"],
                "explanation": scored["explanation"],
                "confidence": scored["confidence"],
            }
        )
        .execute()
    )
    if not ins.data:
        await fail_job(pool, job_id, "INTERNAL", "Failed to insert fit_score_results")
        return

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE fit_score_jobs
            SET status = 'completed', completed_at = now(), result_id = $2
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            uuid.UUID(result_id),
        )
    log.info(
        "fit_score_job_completed",
        job_id=job_id,
        result_id=result_id,
        overall_score=int(scored["overall_score"]),
    )


async def fail_job(pool: asyncpg.Pool, job_id: str, code: str, message: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE fit_score_jobs
            SET status = 'failed', completed_at = now(), error_code = $2, error_message = $3
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            code,
            message,
        )


async def worker_loop() -> None:
    from mirror.core.logging_config import configure_logging

    configure_logging()
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL required for fit score worker")
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    sb = create_service_client(settings)
    log.info("fit_score_worker_started")
    try:
        while True:
            job: asyncpg.Record | None = await claim_job(pool)
            if job is None:
                await asyncio.sleep(1.0)
                continue
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("fit_score_job_crash", job_id=str(job["id"]))
                await fail_job(pool, str(job["id"]), "INTERNAL", "Unhandled worker error")
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())


# Silence unused-import warnings in strict mypy configs.
_ = compute_revision_hash

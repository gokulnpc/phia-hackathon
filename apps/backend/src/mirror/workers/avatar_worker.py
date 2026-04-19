"""Poll avatar_generation_jobs with SKIP LOCKED; Gemini → preprocessed_storage_path."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg
import httpx
import structlog
from supabase import Client

from mirror.core.config import Settings, get_settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_avatar import generate_avatar_png
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()

CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM avatar_generation_jobs
  WHERE status = 'queued'
  ORDER BY scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE avatar_generation_jobs j
SET
  status = 'processing',
  locked_at = now(),
  started_at = COALESCE(j.started_at, now()),
  attempts = j.attempts + 1
FROM cte
WHERE j.id = cte.id
RETURNING j.*;
"""


async def claim_job(pool: asyncpg.Pool) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(CLAIM_SQL)
        return row


async def _download_storage_object(sb: Client, storage_path: str) -> bytes:
    signed = sb.storage.from_("reference-photos").create_signed_url(storage_path, 600)
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not isinstance(url, str):
        raise ProviderError("STORAGE_SIGN_FAILED", "Could not sign reference photo path")
    async with httpx.AsyncClient(timeout=120.0) as hc:
        r = await hc.get(url)
        r.raise_for_status()
        return r.content


def _source_paths_from_row(row: dict[str, Any]) -> list[str]:
    extra = row.get("source_storage_paths")
    primary = str(row["storage_path"])
    if isinstance(extra, list) and len(extra) > 0:
        return [str(p) for p in extra]
    return [primary]


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    user_id = str(job["user_id"])
    ref_id = str(job["reference_photo_id"])
    structlog.contextvars.bind_contextvars(trace_id=str(job["trace_id"]), job_id=job_id)

    res = (
        sb.table("reference_photos")
        .select("storage_path, source_storage_paths, user_id")
        .eq("id", ref_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        await fail_job(pool, job_id, "REFERENCE_MISSING", "Reference photo not found")
        return
    ref_row = rows[0]
    if str(ref_row["user_id"]) != user_id:
        await fail_job(pool, job_id, "REFERENCE_MISMATCH", "Reference photo user mismatch")
        return

    paths = _source_paths_from_row(ref_row)
    try:
        source_bytes = [await _download_storage_object(sb, p) for p in paths]
    except Exception as e:  # noqa: BLE001
        log.exception("avatar_source_download_error", err=str(e))
        await fail_job(pool, job_id, "STORAGE_DOWNLOAD_FAILED", str(e)[:500])
        return

    try:
        png = await generate_avatar_png(settings, source_bytes)
    except ValidationError as e:
        await fail_job(pool, job_id, e.code, str(e))
        return
    except ProviderError as e:
        await fail_job(pool, job_id, e.code, str(e)[:500])
        return
    except Exception as e:  # noqa: BLE001
        log.exception("avatar_gemini_error", err=str(e))
        await fail_job(pool, job_id, "PROVIDER_ERROR", str(e)[:500])
        return

    pre_path = f"{user_id}/{ref_id}_avatar.png"
    try:
        sb.storage.from_("reference-photos").upload(
            pre_path,
            png,
            {"content-type": "image/png", "upsert": "true"},
        )
    except Exception as e:  # noqa: BLE001
        log.exception("avatar_preprocess_upload_error", err=str(e))
        await fail_job(pool, job_id, "STORAGE_UPLOAD_FAILED", str(e)[:500])
        return

    now_iso = datetime.now(UTC).isoformat()
    upd = (
        sb.table("reference_photos")
        .update({"preprocessed_storage_path": pre_path, "preprocessed_at": now_iso})
        .eq("id", ref_id)
        .execute()
    )
    if not upd.data:
        await fail_job(
            pool,
            job_id,
            "INTERNAL",
            "Failed to update reference_photos preprocess fields",
        )
        return

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE avatar_generation_jobs
            SET status = 'completed', completed_at = now()
            WHERE id = $1
            """,
            uuid.UUID(job_id),
        )
    log.info("avatar_job_completed", job_id=job_id, reference_photo_id=ref_id)


async def fail_job(pool: asyncpg.Pool, job_id: str, code: str, message: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE avatar_generation_jobs
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
        raise SystemExit("DATABASE_URL required for avatar worker")
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    sb = create_service_client(settings)
    log.info("avatar_worker_started")
    try:
        while True:
            job = await claim_job(pool)
            if job is None:
                await asyncio.sleep(1.0)
                continue
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("avatar_job_crash", job_id=str(job["id"]))
                await fail_job(pool, str(job["id"]), "INTERNAL", "Unhandled worker error")
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())

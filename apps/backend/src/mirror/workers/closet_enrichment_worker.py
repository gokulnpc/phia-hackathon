"""Polls closet_enrichment_jobs with SKIP LOCKED; Gemini Vision → closet_items.attributes."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg
import structlog
from supabase import Client

from mirror.core.closet.enrichment import (
    download_image_bytes,
    fetch_closet_item_for_enrichment,
)
from mirror.core.config import Settings, get_settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_closet_attributes import (
    ATTRIBUTES_VERSION,
    extract_closet_attributes,
)
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()

CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM closet_enrichment_jobs
  WHERE status = 'queued'
  ORDER BY priority ASC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE closet_enrichment_jobs j
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
        return await conn.fetchrow(CLAIM_SQL)


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    closet_item_id = str(job["closet_item_id"])
    structlog.contextvars.bind_contextvars(trace_id=str(job["trace_id"]), job_id=job_id)

    row = await asyncio.to_thread(fetch_closet_item_for_enrichment, sb, closet_item_id)
    if row is None:
        await fail_job(pool, job_id, "CLOSET_ITEM_MISSING", "Closet item or product not found")
        return

    product = row["product"]
    image_url = str(product.get("primary_image_url") or "").strip()
    if not image_url:
        await fail_job(pool, job_id, "PRODUCT_NO_IMAGE", "Product has no primary image URL")
        return

    hints = {
        "name": product.get("name"),
        "brand": product.get("brand"),
        "category": product.get("category"),
        "color": product.get("color"),
    }

    try:
        image_bytes, mime = await download_image_bytes(image_url)
    except Exception as e:  # noqa: BLE001
        log.exception("enrichment_image_download_failed", err=str(e))
        await fail_job(pool, job_id, "STORAGE_DOWNLOAD_FAILED", str(e)[:500])
        return

    try:
        attributes = await extract_closet_attributes(settings, image_bytes, mime, hints)
    except ValidationError as e:
        await fail_job(pool, job_id, e.code, str(e))
        return
    except ProviderError as e:
        await fail_job(pool, job_id, e.code, str(e)[:500])
        return
    except Exception as e:  # noqa: BLE001
        log.exception("enrichment_gemini_error", err=str(e))
        await fail_job(pool, job_id, "PROVIDER_ERROR", str(e)[:500])
        return

    now_iso = datetime.now(UTC).isoformat()
    upd = (
        sb.table("closet_items")
        .update(
            {
                "attributes": attributes,
                "attributes_version": ATTRIBUTES_VERSION,
                "attributes_generated_at": now_iso,
            }
        )
        .eq("id", closet_item_id)
        .execute()
    )
    if not upd.data:
        await fail_job(pool, job_id, "INTERNAL", "Failed to write closet_items.attributes")
        return

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE closet_enrichment_jobs
            SET status = 'completed', completed_at = now()
            WHERE id = $1
            """,
            uuid.UUID(job_id),
        )
    log.info(
        "closet_enrichment_completed",
        job_id=job_id,
        closet_item_id=closet_item_id,
        attributes_version=ATTRIBUTES_VERSION,
    )


async def fail_job(pool: asyncpg.Pool, job_id: str, code: str, message: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE closet_enrichment_jobs
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
        raise SystemExit("DATABASE_URL required for closet enrichment worker")
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    sb = create_service_client(settings)
    log.info("closet_enrichment_worker_started")
    try:
        while True:
            job: asyncpg.Record | None = await claim_job(pool)
            if job is None:
                await asyncio.sleep(1.0)
                continue
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("closet_enrichment_crash", job_id=str(job["id"]))
                await fail_job(pool, str(job["id"]), "INTERNAL", "Unhandled worker error")
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())


# Re-export for typing callers.
__all__ = ["run_worker", "worker_loop", "process_job", "fail_job", "claim_job"]


_ = Any  # keep import live for mypy-strict re-exports if needed

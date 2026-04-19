"""Poll tryon_editorial_jobs; Gemini polish of primary try-on PNG → derivative tryon_results row."""

from __future__ import annotations

import asyncio
import time
import uuid
from io import BytesIO
from typing import Any

import asyncpg
import httpx
import structlog
from PIL import Image
from supabase import Client

from mirror.core.config import Settings, get_settings
from mirror.core.tryon_fashn_category import fashn_category_from_metadata
from mirror.integrations.gemini_tryon_editorial import (
    enhance_tryon_editorial_png,
    variant_index_from_job_id,
)
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()

CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM tryon_editorial_jobs
  WHERE status = 'queued'
  ORDER BY priority ASC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE tryon_editorial_jobs j
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


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    user_id = str(job["user_id"])
    source_rid = str(job["source_tryon_result_id"])
    structlog.contextvars.bind_contextvars(trace_id=str(job.get("trace_id") or ""), job_id=job_id)
    t_started = time.perf_counter()

    res_src = (
        sb.table("tryon_results")
        .select("*")
        .eq("id", source_rid)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    rows_src = res_src.data or []
    if not rows_src:
        await fail_job(pool, job_id, "SOURCE_MISSING", "Source try-on result not found")
        return
    src_row = rows_src[0]
    if src_row.get("source_result_id") is not None:
        await fail_job(
            pool,
            job_id,
            "EDITORIAL_INVALID_SOURCE",
            "Source is not a primary try-on result",
        )
        return

    jid = src_row.get("job_id")
    if not jid:
        await fail_job(pool, job_id, "SOURCE_BAD", "Source result has no job_id")
        return

    jres = sb.table("tryon_jobs").select("product_metadata").eq("id", str(jid)).limit(1).execute()
    jrows = jres.data or []
    meta: dict[str, Any] = {}
    if jrows and isinstance(jrows[0], dict):
        pm = jrows[0].get("product_metadata")
        if isinstance(pm, dict):
            meta = pm
    category = fashn_category_from_metadata(meta)

    path = src_row.get("storage_path")
    if not isinstance(path, str) or not path.strip():
        await fail_job(pool, job_id, "SOURCE_BAD", "Missing storage_path")
        return

    signed = sb.storage.from_("tryon-results").create_signed_url(path.strip(), 600)
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not isinstance(url, str):
        await fail_job(pool, job_id, "STORAGE_SIGN_FAILED", "Could not sign source image")
        return

    try:
        async with httpx.AsyncClient(timeout=180.0) as hc:
            resp = await hc.get(url)
            resp.raise_for_status()
            raw_bytes = resp.content
    except Exception as e:  # noqa: BLE001
        log.exception("tryon_editorial_download_failed", err=str(e))
        await fail_job(pool, job_id, "DOWNLOAD_FAILED", str(e)[:500])
        return

    try:
        enhanced = await enhance_tryon_editorial_png(
            settings,
            raw_bytes,
            garment_category_key=category,
            variant_index=variant_index_from_job_id(job_id),
        )
    except Exception as e:  # noqa: BLE001
        log.exception("tryon_editorial_gemini_failed", err=str(e))
        await fail_job(pool, job_id, "GEMINI_EDITORIAL_FAILED", str(e)[:500])
        return

    out_w, out_h = 768, 1024
    try:
        with Image.open(BytesIO(enhanced)) as out_im:
            out_w, out_h = out_im.size
    except Exception:  # noqa: BLE001
        pass

    result_id = str(uuid.uuid4())
    storage_main = f"{user_id}/{result_id}.png"
    storage_thumb = f"{user_id}/{result_id}_thumb.png"

    try:
        sb.storage.from_("tryon-results").upload(
            storage_main,
            enhanced,
            {"content-type": "image/png", "upsert": "true"},
        )
        sb.storage.from_("tryon-results").upload(
            storage_thumb,
            enhanced,
            {"content-type": "image/png", "upsert": "true"},
        )
    except Exception as e:  # noqa: BLE001
        log.exception("tryon_editorial_upload_failed", err=str(e))
        await fail_job(pool, job_id, "UPLOAD_FAILED", str(e)[:500])
        return

    ins = (
        sb.table("tryon_results")
        .insert(
            {
                "id": result_id,
                "job_id": str(jid),
                "user_id": user_id,
                "product_id": src_row.get("product_id"),
                "product_image_hash": str(src_row["product_image_hash"]),
                "storage_path": storage_main,
                "thumbnail_storage_path": storage_thumb,
                "provider": "gemini_editorial",
                "quality_score": 0.88,
                "width": out_w,
                "height": out_h,
                "file_size_bytes": len(enhanced),
                "source_result_id": source_rid,
            }
        )
        .execute()
    )
    if not ins.data:
        await fail_job(pool, job_id, "INTERNAL", "Failed to insert editorial tryon_results")
        return

    latency_ms = int((time.perf_counter() - t_started) * 1000)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tryon_editorial_jobs
            SET
              status = 'completed',
              completed_at = now(),
              output_tryon_result_id = $2,
              latency_ms = $3
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            uuid.UUID(result_id),
            latency_ms,
        )
    log.info(
        "tryon_editorial_job_completed",
        job_id=job_id,
        output_result_id=result_id,
        latency_ms=latency_ms,
    )


async def fail_job(pool: asyncpg.Pool, job_id: str, code: str, message: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tryon_editorial_jobs
            SET
              status = 'failed',
              completed_at = now(),
              error_code = $2,
              error_message = $3
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
        raise SystemExit("DATABASE_URL required for worker")
    if not settings.gemini_api_key.strip():
        log.warning("tryon_editorial_worker_no_gemini_key")
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    sb = create_service_client(settings)
    log.info("tryon_editorial_worker_started")
    try:
        while True:
            job = await claim_job(pool)
            if job is None:
                await asyncio.sleep(1.0)
                continue
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("tryon_editorial_job_crash", job_id=str(job["id"]))
                await fail_job(pool, str(job["id"]), "INTERNAL", "Unhandled worker error")
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())

"""Polls tryon_jobs with SKIP LOCKED and runs Fash AI Virtual Try-On v1.6 (direct API)."""

from __future__ import annotations

import asyncio
import contextlib
import json
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
from mirror.core.tryon_preprocess import (
    MODEL_CANVAS_H,
    MODEL_CANVAS_W,
    fit_reference_to_3x4_png,
)
from mirror.integrations.fashn_direct_tryon import fashn_output_image_url, run_fashn_tryon
from mirror.integrations.gemini_tryon_editorial import (
    enhance_tryon_editorial_png,
    resolve_tryon_editorial_model,
    variant_index_from_job_id,
)
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()


def _first_http_url(obj: Any) -> str | None:
    if isinstance(obj, str) and obj.startswith("http"):
        return obj
    if isinstance(obj, dict):
        for v in obj.values():
            u = _first_http_url(v)
            if u:
                return u
    if isinstance(obj, list):
        for v in obj:
            u = _first_http_url(v)
            if u:
                return u
    return None


def _job_metadata(job: asyncpg.Record) -> dict[str, Any]:
    raw = job.get("product_metadata")
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _fashn_mode(job_mode: Any) -> str:
    m = str(job_mode).strip().lower() if job_mode is not None else "standard"
    if m == "fast":
        return "performance"
    if m == "quality":
        return "quality"
    return "balanced"


CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM tryon_jobs
  WHERE status = 'queued'
  ORDER BY priority ASC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE tryon_jobs j
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


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    user_id = str(job["user_id"])
    product_url = str(job["product_image_url"])
    ref_id = str(job["reference_photo_id"])
    structlog.contextvars.bind_contextvars(trace_id=str(job["trace_id"]), job_id=job_id)

    model_ref_rid = job.get("model_reference_tryon_result_id")
    model_ref_str = str(model_ref_rid).strip() if model_ref_rid else ""

    human_url: str | None = None
    if model_ref_str:
        tres = (
            sb.table("tryon_results")
            .select("storage_path")
            .eq("id", model_ref_str)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        trows = tres.data or []
        if not trows:
            await fail_job(
                pool,
                job_id,
                "MODEL_REF_MISSING",
                "Try-on result for model reference not found",
            )
            return
        tpath = trows[0].get("storage_path")
        if not isinstance(tpath, str) or not tpath.strip():
            await fail_job(pool, job_id, "MODEL_REF_MISSING", "Try-on result has no storage path")
            return
        signed_tr = sb.storage.from_("tryon-results").create_signed_url(tpath.strip(), 600)
        human_url = signed_tr.get("signedURL") or signed_tr.get("signedUrl")
    else:
        res = (
            sb.table("reference_photos")
            .select("storage_path, preprocessed_storage_path")
            .eq("id", ref_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            await fail_job(pool, job_id, "REFERENCE_MISSING", "Reference photo not found")
            return
        pre = rows[0].get("preprocessed_storage_path")
        path = str(pre) if pre else str(rows[0]["storage_path"])
        signed = sb.storage.from_("reference-photos").create_signed_url(path, 600)
        human_url = signed.get("signedURL") or signed.get("signedUrl")
    if not isinstance(human_url, str):
        await fail_job(pool, job_id, "STORAGE_SIGN_FAILED", "Could not sign model/reference image")
        return

    temp_model_path = f"{user_id}/_tryon_model_{job_id}.png"
    meta = _job_metadata(job)
    category = fashn_category_from_metadata(meta)
    fashn_mode = _fashn_mode(job.get("mode"))
    provider_response: dict[str, Any] | None = None

    try:
        async with httpx.AsyncClient(timeout=180.0) as hc:
            ref_resp = await hc.get(human_url)
            ref_resp.raise_for_status()
            raw_bytes = ref_resp.content

        png_3x4 = fit_reference_to_3x4_png(raw_bytes)
        sb.storage.from_("reference-photos").upload(
            temp_model_path,
            png_3x4,
            {"content-type": "image/png", "upsert": "true"},
        )
        model_signed = sb.storage.from_("reference-photos").create_signed_url(temp_model_path, 600)
        model_url = model_signed.get("signedURL") or model_signed.get("signedUrl")
        if not isinstance(model_url, str):
            await fail_job(pool, job_id, "STORAGE_SIGN_FAILED", "Could not sign 3:4 model image")
            return

        provider_response = await run_fashn_tryon(
            settings,
            model_image=model_url,
            garment_image=product_url,
            category=category,
            mode=fashn_mode,
        )
    except Exception as e:  # noqa: BLE001 — surface to job row
        log.exception("tryon_provider_error", err=str(e))
        await fail_job(pool, job_id, "PROVIDER_ERROR", str(e)[:500])
        return
    finally:
        with contextlib.suppress(Exception):
            sb.storage.from_("reference-photos").remove([temp_model_path])

    if provider_response is None:
        return

    out_url = fashn_output_image_url(provider_response)
    if not out_url:
        out_url = _first_http_url(provider_response)
    if not out_url:
        await fail_job(pool, job_id, "PROVIDER_BAD_RESPONSE", "No image URL in provider response")
        return

    async with httpx.AsyncClient(timeout=180.0) as hc:
        img = await hc.get(out_url)
        img.raise_for_status()
        content = img.content

    if settings.tryon_editorial_enabled:
        editorial_model = resolve_tryon_editorial_model(settings)
        if settings.gemini_api_key.strip() and editorial_model:
            try:
                vidx = variant_index_from_job_id(job_id)
                content = await enhance_tryon_editorial_png(
                    settings,
                    content,
                    garment_category_key=category,
                    variant_index=vidx,
                )
                log.info("tryon_editorial_applied", job_id=job_id)
            except Exception as e:  # noqa: BLE001 — fallback to raw FASHN; editorial is best-effort
                log.warning(
                    "tryon_editorial_fallback",
                    job_id=job_id,
                    err=str(e)[:500],
                )

    out_w, out_h = MODEL_CANVAS_W, MODEL_CANVAS_H
    try:
        with Image.open(BytesIO(content)) as out_im:
            out_w, out_h = out_im.size
    except Exception:  # noqa: BLE001
        pass

    result_id = str(uuid.uuid4())
    storage_main = f"{user_id}/{result_id}.png"
    storage_thumb = f"{user_id}/{result_id}_thumb.png"

    sb.storage.from_("tryon-results").upload(
        storage_main,
        content,
        {"content-type": "image/png", "upsert": "true"},
    )
    sb.storage.from_("tryon-results").upload(
        storage_thumb,
        content,
        {"content-type": "image/png", "upsert": "true"},
    )

    ins = (
        sb.table("tryon_results")
        .insert(
            {
                "id": result_id,
                "job_id": job_id,
                "user_id": user_id,
                "product_id": job["product_id"],
                "product_image_hash": str(job["product_image_hash"]),
                "storage_path": storage_main,
                "thumbnail_storage_path": storage_thumb,
                "provider": "fashn",
                "quality_score": 0.85,
                "width": out_w,
                "height": out_h,
                "file_size_bytes": len(content),
            }
        )
        .execute()
    )
    if not ins.data:
        await fail_job(pool, job_id, "INTERNAL", "Failed to insert tryon_results")
        return

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tryon_jobs
            SET status = 'completed', completed_at = now(), result_id = $2, provider = 'fashn'
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            uuid.UUID(result_id),
        )
    log.info("tryon_job_completed", job_id=job_id, result_id=result_id)


async def fail_job(pool: asyncpg.Pool, job_id: str, code: str, message: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tryon_jobs
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
        raise SystemExit("DATABASE_URL required for worker")
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    sb = create_service_client(settings)
    log.info("tryon_worker_started")
    try:
        while True:
            job = await claim_job(pool)
            if job is None:
                await asyncio.sleep(1.0)
                continue
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("tryon_job_crash", job_id=str(job["id"]))
                await fail_job(pool, str(job["id"]), "INTERNAL", "Unhandled worker error")
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())

"""Poll `tryon_video_jobs`; Veo 3.1 → MP4 → Supabase Storage → row updates.

Triggered by the web app: user clicks "Generate video" on the closet detail
page, the page INSERTs a row into `tryon_video_jobs` via the user's own
Supabase JWT (RLS gates ownership). This worker claims the row, calls
Veo (30 s – 3 min), uploads the resulting MP4 to the existing
`tryon-results` bucket under `videos/<user_id>/<tryon_result_id>.mp4`,
and writes the path to both `tryon_video_jobs` AND
`tryon_results.video_storage_path` so the page renders the player on the
next reload (or via Realtime push if the client is still subscribed).

Mirrors `tryon_editorial_worker.py` (closest analog: same Storage flow,
same FOR UPDATE SKIP LOCKED claim, same fail-job pattern).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import UTC, datetime

import asyncpg
import structlog
from supabase import Client

from mirror.core.config import Settings, get_settings
from mirror.core.errors import ProviderError
from mirror.integrations.gemini_video import generate_tryon_video
from mirror.integrations.supabase_client import create_service_client

log = structlog.get_logger()

# Veo at $0.10-0.20/clip — never auto-retry transient failures. The user
# can re-click Generate if it failed for a recoverable reason.
MAX_ATTEMPTS = 1

# Default prompt when the client doesn't supply one — describes a generic
# editorial shot of the person in the try-on, preserving the look.
DEFAULT_PROMPT = (
    "Slow cinematic dolly-in on the model. They shift weight subtly, "
    "tilt their head toward camera, and hold the pose. Soft natural "
    "light, fashion editorial style, ambient sounds. Preserve the "
    "person's appearance and outfit exactly."
)

CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM tryon_video_jobs
  WHERE status = 'queued'
    AND scheduled_at <= now()
  ORDER BY scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE tryon_video_jobs j
SET
  status = 'processing',
  attempts = j.attempts + 1,
  locked_at = now(),
  started_at = now()
FROM cte
WHERE j.id = cte.id
RETURNING j.*;
"""


async def claim_job(pool: asyncpg.Pool) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        return await conn.fetchrow(CLAIM_SQL)


def _download_from_storage(sb: Client, bucket: str, path: str) -> bytes:
    """Service-role download from a private Supabase Storage bucket."""
    res = sb.storage.from_(bucket).download(path)
    if isinstance(res, (bytes, bytearray)):
        return bytes(res)
    raise ProviderError(
        "STORAGE_DOWNLOAD_FAILED",
        f"download({bucket}/{path}) returned non-bytes: {type(res).__name__}",
    )


def _upload_to_storage(
    sb: Client, bucket: str, path: str, data: bytes, content_type: str
) -> None:
    sb.storage.from_(bucket).upload(
        path,
        data,
        {"content-type": content_type, "x-upsert": "true"},
    )


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    user_id = str(job["user_id"])
    tryon_result_id = str(job["tryon_result_id"])
    prompt = (job.get("prompt") or "").strip() or DEFAULT_PROMPT
    structlog.contextvars.bind_contextvars(
        trace_id=str(job.get("trace_id") or ""),
        user_id_hash=user_id[:8],
        job_id=job_id,
        tryon_result_id=tryon_result_id[:8],
    )
    t_started = time.perf_counter()
    log.info("tryon_video_job_claimed", prompt_preview=prompt[:60])

    # 1. Resolve the source try-on.
    res = (
        sb.table("tryon_results")
        .select("id, user_id, storage_path, thumbnail_storage_path")
        .eq("id", tryon_result_id)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        await fail_job(pool, job_id, "SOURCE_MISSING", "tryon_result not found")
        return
    src = rows[0]
    image_path = src.get("storage_path") or src.get("thumbnail_storage_path")
    if not isinstance(image_path, str) or not image_path.strip():
        await fail_job(
            pool, job_id, "SOURCE_BAD", "Source try-on has no storage_path"
        )
        return

    # 2. Download the still image.
    try:
        image_bytes = await asyncio.to_thread(
            _download_from_storage, sb, "tryon-results", image_path
        )
    except ProviderError as exc:
        await fail_job(pool, job_id, exc.code, str(exc)[:500])
        return
    except Exception as exc:  # noqa: BLE001
        log.exception("tryon_video_download_failed", err=str(exc))
        await fail_job(pool, job_id, "DOWNLOAD_FAILED", str(exc)[:500])
        return

    image_mime = (
        "image/jpeg" if image_path.lower().endswith((".jpg", ".jpeg")) else "image/png"
    )

    # 3. Run Veo (30 s – 3 min). Wrapped in a thread so the event loop
    #    can keep up Realtime / pool work — generate_tryon_video is sync
    #    internally because Veo's poll loop uses time.sleep.
    try:
        video_bytes = await asyncio.to_thread(
            generate_tryon_video,
            settings,
            image_bytes=image_bytes,
            image_mime=image_mime,
            prompt=prompt,
        )
    except ProviderError as exc:
        await fail_job(pool, job_id, exc.code, str(exc)[:500])
        return
    except Exception as exc:  # noqa: BLE001
        log.exception("tryon_video_veo_failed", err=str(exc))
        await fail_job(pool, job_id, "VEO_FAILED", str(exc)[:500])
        return

    # 4. Upload MP4 to the same bucket as the still. Path convention puts
    #    `<user_id>` FIRST so the existing tryon-results storage RLS policy
    #    (matches `name LIKE auth.uid() || '/%'`) lets the user read it back
    #    via createSignedUrl from the browser. Earlier `videos/<user_id>/...`
    #    layout was rejected as "Object not found" (RLS 403 → masked 404).
    video_path = f"{user_id}/videos/{tryon_result_id}.mp4"
    try:
        await asyncio.to_thread(
            _upload_to_storage, sb, "tryon-results", video_path, video_bytes, "video/mp4"
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("tryon_video_upload_failed", err=str(exc))
        await fail_job(pool, job_id, "UPLOAD_FAILED", str(exc)[:500])
        return

    # 5. Write back to both tryon_results (long-term cache) and the job row
    #    (web client polls/realtime-subs the job to know when to render).
    now_iso = datetime.now(UTC).isoformat()
    try:
        sb.table("tryon_results").update(
            {"video_storage_path": video_path, "video_generated_at": now_iso}
        ).eq("id", tryon_result_id).execute()
    except Exception as exc:  # noqa: BLE001
        log.exception("tryon_video_result_update_failed", err=str(exc))
        await fail_job(pool, job_id, "RESULT_UPDATE_FAILED", str(exc)[:500])
        return

    latency_ms = int((time.perf_counter() - t_started) * 1000)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tryon_video_jobs
            SET
              status = 'completed',
              completed_at = now(),
              video_storage_path = $2,
              latency_ms = $3
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            video_path,
            latency_ms,
        )
    log.info(
        "tryon_video_job_completed",
        job_id=job_id,
        video_storage_path=video_path,
        latency_ms=latency_ms,
        bytes=len(video_bytes),
    )


async def fail_job(
    pool: asyncpg.Pool, job_id: str, code: str, message: str
) -> None:
    """Terminal failure — Veo costs too much to auto-retry."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE tryon_video_jobs
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
    log.warning("tryon_video_job_failed", job_id=job_id, code=code)


async def worker_loop() -> None:
    from mirror.core.logging_config import configure_logging

    configure_logging()
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL required for tryon-video worker")
    if not settings.gemini_api_key.strip():
        log.warning("tryon_video_worker_no_gemini_key")
    pool = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=2
    )
    sb = create_service_client(settings)
    log.info("tryon_video_worker_started", max_attempts=MAX_ATTEMPTS)
    try:
        while True:
            job = await claim_job(pool)
            if job is None:
                await asyncio.sleep(1.0)
                continue
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("tryon_video_job_crash", job_id=str(job["id"]))
                await fail_job(
                    pool,
                    str(job["id"]),
                    "INTERNAL",
                    "Unhandled worker error",
                )
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())

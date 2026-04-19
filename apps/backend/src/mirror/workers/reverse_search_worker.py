"""Reverse-search worker: claim queued jobs, call provider, cache results.

Mirrors the fit-score / try-on worker pattern (SKIP LOCKED claim, service
Supabase client for writes, asyncpg for the update-on-completion UPDATE).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any
from urllib.parse import urlparse

import asyncpg
import structlog
from supabase import Client

from mirror.core.closet.enrichment import download_image_bytes
from mirror.core.config import Settings, get_settings
from mirror.core.errors import ProviderError
from mirror.core.visual_search.brand_tuning import get_brand_tuning
from mirror.core.visual_search.interface import RawVisualMatch
from mirror.core.visual_search.providers import get_provider
from mirror.core.visual_search.service import PROMPT_VERSION
from mirror.integrations.gemini_person_filter import (
    MAX_BATCH_SIZE as PERSON_FILTER_BATCH,
)
from mirror.integrations.gemini_person_filter import (
    filter_images_for_persons,
)
from mirror.integrations.supabase_client import create_service_client

# --- Retry / backoff -------------------------------------------------------
# Transient upstream failures (SerpAPI 5xx, provider timeouts, network
# blips) are worth retrying. Config / quota / shape errors are not — a
# retry will fail the same way.
MAX_ATTEMPTS = 3  # initial attempt + 2 retries
_TRANSIENT_CODES: frozenset[str] = frozenset(
    {
        "SERPAPI_TIMEOUT",
        "SERPAPI_NETWORK_ERROR",
        "APIFY_TIMEOUT",
        "APIFY_NETWORK_ERROR",
        "PROVIDER_ERROR",
        "IMAGE_TOO_LARGE",
        "STORAGE_DOWNLOAD_FAILED",
        "INTERNAL",
    }
)


def _is_transient(code: str) -> bool:
    # Config/quota errors (SERPAPI_NOT_CONFIGURED, SERPAPI_QUOTA_EXCEEDED,
    # SERPAPI_BAD_RESPONSE etc.) intentionally stay non-transient — a retry
    # would hit the same failure. Only codes explicitly listed as transient
    # are worth re-running.
    return code in _TRANSIENT_CODES


def _backoff_seconds(attempt: int) -> float:
    # 0 → 5s, 1 → 20s (exponential with a floor so the worker doesn't busy-loop).
    return max(5.0, 5.0 * (2 ** max(0, attempt - 1)))

log = structlog.get_logger()

CLAIM_SQL = """
WITH cte AS (
  SELECT id FROM reverse_search_jobs
  WHERE status = 'queued'
    AND scheduled_at <= now()
  ORDER BY priority ASC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE reverse_search_jobs j
SET
  status = 'processing',
  locked_at = now(),
  -- Reset started_at on retry so latency_ms reflects this attempt only.
  started_at = now()
FROM cte
WHERE j.id = cte.id
RETURNING j.*;
"""


async def claim_job(pool: asyncpg.Pool) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        return await conn.fetchrow(CLAIM_SQL)


def _lookup_product(sb: Client, canonical_url_hash: str) -> dict[str, Any] | None:
    res = (
        sb.table("products")
        .select("id, name, brand, category, primary_image_url, canonical_url")
        .eq("canonical_url_hash", canonical_url_hash)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows or not isinstance(rows[0], dict):
        return None
    return dict(rows[0])


def _candidate_text_query(product: dict[str, Any] | None) -> str:
    if not product:
        return ""
    parts: list[str] = []
    name = product.get("name")
    if isinstance(name, str) and name.strip():
        parts.append(name.strip())
    brand = product.get("brand")
    if isinstance(brand, str) and brand.strip():
        parts.append(brand.strip())
    return " ".join(parts)


# phash Hamming-distance threshold for cross-provider near-duplicate dedup.
# 64-bit phash → 0-64 range; 6 is a well-tested "visually identical" cutoff
# per imagehash docs. Higher = more aggressive dedup; 6 keeps distinct crops.
_PHASH_HAMMING_THRESHOLD = 6


def _compute_phash(image_bytes: bytes) -> Any | None:
    """Return imagehash.ImageHash or None on any failure (CPU-only, ~5 ms)."""
    try:
        from io import BytesIO

        import imagehash
        from PIL import Image

        with Image.open(BytesIO(image_bytes)) as img:
            img.load()
            return imagehash.phash(img)
    except Exception:
        return None


def _is_near_duplicate(new_h: Any, seen: list[Any]) -> bool:
    if new_h is None:
        return False
    for h in seen:
        try:
            if (new_h - h) <= _PHASH_HAMMING_THRESHOLD:
                return True
        except Exception:
            continue
    return False


async def _apply_person_filter(
    settings: Settings, matches: list[RawVisualMatch]
) -> list[RawVisualMatch]:
    """Drop non-person web matches (Gemini filter) + cross-provider duplicates (phash).

    Flow:
      1. Download the top `MAX_BATCH_SIZE` matches in parallel (bounded by
         the 3 MB per-image cap + 30 s timeout in `download_image_bytes`).
      2. Compute perceptual hash (phash) on each; drop near-duplicates vs
         already-kept hashes (threshold 6 bits).
      3. Resize + send the deduped bytes to the Gemini filter; apply
         keep-mask. Overflow rows beyond the batch cap are kept unfiltered
         (we never silently delete provider output).
      4. On any exceptional path (filter quota, Gemini down, dep missing)
         return the unfiltered set — a noisier grid is better than empty.
    """
    if not matches:
        return matches

    capped = matches[:PERSON_FILTER_BATCH]
    overflow = matches[PERSON_FILTER_BATCH:]

    async def _fetch(
        m: RawVisualMatch,
    ) -> tuple[RawVisualMatch, bytes, str] | None:
        try:
            image_bytes, mime = await download_image_bytes(m["image_url"])
        except Exception as exc:  # noqa: BLE001
            log.debug(
                "reverse_search_image_download_failed",
                err=str(exc),
                url=m["image_url"],
            )
            return None
        return m, image_bytes, mime

    fetched = await asyncio.gather(*[_fetch(m) for m in capped])
    downloaded = [item for item in fetched if item is not None]
    if not downloaded:
        return overflow  # everything we could have filtered failed to download

    # Perceptual-hash dedup across providers. Runs in a thread so 20 phash
    # computations don't stall the event loop.
    phashes = await asyncio.gather(
        *[asyncio.to_thread(_compute_phash, b) for _, b, _ in downloaded]
    )
    deduped: list[tuple[RawVisualMatch, bytes, str]] = []
    seen_hashes: list[Any] = []
    dropped_phash = 0
    for (m, b, mime), h in zip(downloaded, phashes, strict=False):
        if _is_near_duplicate(h, seen_hashes):
            dropped_phash += 1
            continue
        deduped.append((m, b, mime))
        if h is not None:
            seen_hashes.append(h)
    if dropped_phash:
        log.info(
            "reverse_search_phash_dedup",
            downloaded=len(downloaded),
            deduped=len(deduped),
            dropped=dropped_phash,
        )

    try:
        mask = await filter_images_for_persons(
            settings, [(b, mime) for _, b, mime in deduped]
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("reverse_search_person_filter_failed", err=str(exc))
        return [m for m, _, _ in deduped] + overflow

    kept = [deduped[i][0] for i, keep in enumerate(mask) if keep]
    # Overflow rows beyond MAX_BATCH_SIZE weren't evaluated; keep them rather
    # than silently dropping what the provider returned.
    return kept + overflow


async def process_job(
    settings: Settings, sb: Client, pool: asyncpg.Pool, job: asyncpg.Record
) -> None:
    job_id = str(job["id"])
    canonical_url_hash = str(job["canonical_url_hash"])
    provider_name = str(job["provider"])
    # Row has `attempts` after migration 20260423120000_reverse_search_attempts.
    # `dict(job).get(...)` tolerates both pre- and post-migration column sets
    # without reaching for asyncpg.Record private attrs.
    attempts = int(dict(job).get("attempts") or 0)
    job_started = time.perf_counter()
    structlog.contextvars.bind_contextvars(
        trace_id=str(job["trace_id"]),
        user_id_hash=str(job["user_id"])[:8],
        job_id=job_id,
        provider=provider_name,
        attempt=attempts,
    )

    # Re-check cache — a sibling worker may have just populated it.
    product = await asyncio.to_thread(_lookup_product, sb, canonical_url_hash)
    candidate_image_url = ""
    if product:
        img = product.get("primary_image_url")
        if isinstance(img, str) and img.strip():
            candidate_image_url = img.strip()
        tuning = get_brand_tuning(product)
        if tuning:
            product = await tuning.refresh_product(sb, product)
            img2 = product.get("primary_image_url")
            if isinstance(img2, str) and img2.strip():
                candidate_image_url = img2.strip()

    candidate_queries = None
    if product:
        tuning = get_brand_tuning(product)
        if tuning:
            candidate_queries = tuning.build_queries(
                product,
                image_url=candidate_image_url,
            )

    # Fail-fast when we have nothing for any provider to work with. Without
    # this the worker would silently cache an empty-results row; the empty-
    # cache guard in service.py prevents a stale 0-match cache from being
    # served, but the user still sees "No web matches yet" with no actionable
    # reason. `MISSING_PRODUCT_IMAGE` is in `_TRANSIENT_CODES=False` land —
    # retrying won't fix an absent `products` row; the client must send
    # `extracted` metadata on the next POST so the router's upsert populates
    # the catalog.
    if not candidate_image_url and candidate_queries is None:
        log.warning(
            "reverse_search_empty_input",
            has_image=False,
            has_queries=False,
            product_present=bool(product),
        )
        await _fail_or_retry(
            pool,
            job_id,
            attempts,
            "MISSING_PRODUCT_IMAGE",
            "Reverse search needs a product image or brand-tuned queries.",
        )
        return

    provider = get_provider(settings)
    # Jobs are enqueued with a specific provider; if the env has changed in
    # flight, fail cleanly rather than silently serve from the wrong provider.
    if provider.name != provider_name:
        await _fail_or_retry(
            pool,
            job_id,
            attempts,
            "PROVIDER_CHANGED",
            f"Job enqueued for '{provider_name}' but current provider is '{provider.name}'.",
        )
        return
    if not provider.is_available(settings):
        await _fail_or_retry(
            pool,
            job_id,
            attempts,
            "PROVIDER_NOT_CONFIGURED",
            f"Provider '{provider_name}' is not configured.",
        )
        return

    try:
        raw_matches = await provider.lookup(
            candidate_image_url=candidate_image_url,
            candidate_image_bytes=None,
            candidate_text_query=_candidate_text_query(product),
            candidate_queries=candidate_queries,
        )
    except ProviderError as exc:
        await _fail_or_retry(pool, job_id, attempts, exc.code, str(exc)[:500])
        return
    except Exception as exc:  # noqa: BLE001
        log.exception("reverse_search_provider_error", err=str(exc))
        await _fail_or_retry(
            pool, job_id, attempts, "PROVIDER_ERROR", str(exc)[:500]
        )
        return

    # P4: Gemini person-filter. Drops flatlays/logos before we render the
    # "Around the web" grid. Soft-fails if GEMINI_PERSON_FILTER_MODEL is unset
    # (filter returns all-True) so the feature degrades gracefully.
    filtered_matches = await _apply_person_filter(settings, raw_matches)

    # Soft-delete any prior live cache row for this key so the partial-unique
    # index (idx_rs_results_cache_key, restricted to deleted_at IS NULL) won't
    # reject a refresh after expiry. Concurrent worker race is rare; if it
    # happens the loser hits a unique violation that the worker_loop catch-all
    # turns into a failed job — acceptable given the next request will hit the
    # cache anyway.
    from datetime import UTC, datetime

    sb.table("reverse_search_results").update(
        {"deleted_at": datetime.now(UTC).isoformat()}
    ).eq("canonical_url_hash", canonical_url_hash).eq(
        "provider", provider_name
    ).eq("prompt_version", PROMPT_VERSION).is_(
        "deleted_at", "null"
    ).execute()

    result_id = str(uuid.uuid4())
    # supabase-py serializes the JSONB column via json.dumps; TypedDict rows
    # are dict subclasses, so casting to list[dict[str, Any]] is enough for the
    # strict-mypy insert-arg overload.
    web_results_payload: list[dict[str, Any]] = [dict(m) for m in filtered_matches]
    ins = (
        sb.table("reverse_search_results")
        .insert(
            {
                "id": result_id,
                "job_id": job_id,
                "canonical_url_hash": canonical_url_hash,
                "provider": provider_name,
                "prompt_version": PROMPT_VERSION,
                "web_results": web_results_payload,
            }
        )
        .execute()
    )
    if not ins.data:
        await _fail_or_retry(
            pool, job_id, attempts, "INTERNAL", "Failed to insert reverse_search_results"
        )
        return

    latency_ms = int((time.perf_counter() - job_started) * 1000)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE reverse_search_jobs
            SET status = 'completed',
                completed_at = now(),
                latency_ms = $3,
                result_id = $2
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            uuid.UUID(result_id),
            latency_ms,
        )
    log.info(
        "reverse_search_job_completed",
        job_id=job_id,
        result_id=result_id,
        raw_count=len(raw_matches),
        kept_count=len(filtered_matches),
        latency_ms=latency_ms,
    )


async def fail_job(pool: asyncpg.Pool, job_id: str, code: str, message: str) -> None:
    """Terminal failure — job won't be re-processed by this worker."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE reverse_search_jobs
            SET status = 'failed', completed_at = now(), error_code = $2, error_message = $3
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            code,
            message,
        )


async def _reschedule_for_retry(
    pool: asyncpg.Pool, job_id: str, attempts: int, code: str, message: str
) -> None:
    """Re-queue a job with exponential backoff; bumps `attempts`."""
    delay_s = _backoff_seconds(attempts)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE reverse_search_jobs
            SET status = 'queued',
                attempts = $2,
                error_code = $3,
                error_message = $4,
                scheduled_at = now() + ($5 || ' seconds')::interval,
                locked_at = NULL,
                started_at = NULL
            WHERE id = $1
            """,
            uuid.UUID(job_id),
            attempts + 1,
            code,
            message,
            str(delay_s),
        )
    log.info(
        "reverse_search_job_rescheduled",
        job_id=job_id,
        next_attempt=attempts + 1,
        retry_delay_s=delay_s,
        code=code,
    )


async def _fail_or_retry(
    pool: asyncpg.Pool,
    job_id: str,
    attempts: int,
    code: str,
    message: str,
) -> None:
    """Decide: retry with backoff (transient + under cap) vs terminal fail."""
    if attempts + 1 < MAX_ATTEMPTS and _is_transient(code):
        await _reschedule_for_retry(pool, job_id, attempts, code, message)
        return
    await fail_job(pool, job_id, code, message)


async def _cleanup_stale_cache_rows(pool: asyncpg.Pool) -> int:
    """Hard-delete soft-deleted cache rows older than 7 days.

    Runs once on worker startup. Uses the partial index
    `idx_rs_results_sweep` added in migration
    `20260423120000_reverse_search_attempts.sql` for an efficient scan.
    Returns the row count deleted; swallows any error (cleanup is best-effort
    and must not block the worker from doing real work).
    """
    try:
        async with pool.acquire() as conn:
            deleted = await conn.fetchval(
                """
                WITH gone AS (
                  DELETE FROM public.reverse_search_results
                  WHERE deleted_at IS NOT NULL
                    AND fetched_at < now() - interval '7 days'
                  RETURNING 1
                )
                SELECT count(*) FROM gone
                """
            )
            return int(deleted or 0)
    except Exception as exc:  # noqa: BLE001
        log.warning("reverse_search_cleanup_failed", err=str(exc))
        return 0


def _database_log_hint(database_url: str) -> str:
    """Non-secret hint so local vs Supabase URL mismatches are obvious in logs."""
    try:
        u = urlparse(database_url)
        host = u.hostname or ""
        tail = (u.path or "").rstrip("/").split("/")[-1] if u.path else ""
        return f"{host}/{tail}" if host else ""
    except Exception:
        return ""


async def worker_loop() -> None:
    from mirror.core.logging_config import configure_logging

    configure_logging()
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL required for reverse-search worker")
    pool = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=2
    )
    sb = create_service_client(settings)
    cleaned = await _cleanup_stale_cache_rows(pool)
    log.info(
        "reverse_search_worker_started",
        database_hint=_database_log_hint(settings.database_url),
        cache_rows_cleaned=cleaned,
    )
    idle_polls = 0
    try:
        while True:
            job: asyncpg.Record | None = await claim_job(pool)
            if job is None:
                idle_polls += 1
                if idle_polls == 10:
                    log.info(
                        "reverse_search_worker_waiting_for_jobs",
                        idle_poll_seconds=idle_polls,
                        database_hint=_database_log_hint(settings.database_url),
                        hint=(
                            "No reverse_search_jobs rows with status=queued — POST "
                            "/reverse-search skips enqueue when cache_hit is true "
                            "(was also true for cached empty web_results before the "
                            "empty-cache fix)."
                        ),
                    )
                await asyncio.sleep(1.0)
                continue
            idle_polls = 0
            log.info(
                "reverse_search_job_claimed",
                job_id=str(job["id"]),
                canonical_url_hash_preview=str(job["canonical_url_hash"])[:16],
            )
            try:
                await process_job(settings, sb, pool, job)
            except Exception:  # noqa: BLE001
                log.exception("reverse_search_job_crash", job_id=str(job["id"]))
                # Worker-level crashes get the same retry treatment as
                # transient provider errors — the next attempt may succeed
                # if the crash was a one-off (asyncpg disconnect, etc).
                job_attempts = int(dict(job).get("attempts") or 0)
                await _fail_or_retry(
                    pool,
                    str(job["id"]),
                    job_attempts,
                    "INTERNAL",
                    "Unhandled worker error",
                )
    finally:
        await pool.close()


def run_worker() -> None:
    asyncio.run(worker_loop())

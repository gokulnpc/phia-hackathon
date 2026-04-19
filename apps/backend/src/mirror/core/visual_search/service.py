"""Reverse search service layer.

Two concerns, both keyed off `products.canonical_url_hash`:

1. **Mirror-native** (`fetch_mirror_results`) — synchronous posts query
   with explicit public/approved filters + fresh signed URLs.
2. **External cache + enqueue** (`find_cached_web_results`,
   `enqueue_web_results_job`) — cache lookup against
   `reverse_search_results`, else a job row in `reverse_search_jobs`
   for `mirror-reverse-search-worker` to claim.
"""

from __future__ import annotations

import uuid
from typing import Any

# Bump when the reverse-search prompt or result schema changes; participates
# in the unique cache key on `reverse_search_results`.
# v4: tightened Gemini person-filter prompt (reject mannequins + studio shots)
#     and SerpAPI Lens dedup key (keep per-thumbnail `tbn:…` instead of
#     collapsing all Google-cached thumbnails to one key). Old rows filtered
#     pre-tightening would now be rejected → force a refresh.
PROMPT_VERSION = 4

# 1-hour signed URL TTL matches the extension's Feed tab. Interactive browse
# context — the 5-minute default used by try-on polling is too short here.
SIGNED_URL_TTL_SECONDS = 3600


def _project_post_row(
    row: dict[str, Any],
    *,
    signed_image_url: str | None,
    signed_thumbnail_url: str | None,
) -> dict[str, Any]:
    return {
        "post_id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "image_url": signed_image_url or row.get("image_url") or "",
        "thumbnail_url": signed_thumbnail_url,
        "caption": row.get("caption") or "",
        "created_at": row.get("created_at"),
        "reaction_count": int(row.get("reaction_count") or 0),
        "comment_count": int(row.get("comment_count") or 0),
    }


def _sign_one(sb: Any, bucket: str, path: str | None) -> str | None:
    if not isinstance(path, str) or not path.strip():
        return None
    res = sb.storage.from_(bucket).create_signed_url(path, SIGNED_URL_TTL_SECONDS)
    url = res.get("signedURL") or res.get("signedUrl")
    return url if isinstance(url, str) and url else None


def fetch_mirror_results(
    sb: Any, canonical_url_hash: str, *, limit: int = 20
) -> list[dict[str, Any]]:
    """Public+approved posts for a product, with fresh try-on signed URLs.

    Uses the service-role client with explicit `moderation_status`/`visibility`
    filters — equivalent to the `posts` RLS policy *except* the `blocks`
    check, which is acceptable for a reverse-search demo and will be tightened
    when the route migrates to user-scoped Supabase calls.
    """
    res = (
        sb.table("posts")
        .select(
            "id, user_id, tryon_result_id, image_url, caption, created_at, "
            "reaction_count, comment_count, "
            "products!inner(canonical_url_hash)"
        )
        .eq("products.canonical_url_hash", canonical_url_hash)
        .eq("visibility", "public")
        .eq("moderation_status", "approved")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return []

    tryon_ids = [r["tryon_result_id"] for r in rows if r.get("tryon_result_id")]
    storage_by_id: dict[str, dict[str, Any]] = {}
    if tryon_ids:
        trs = (
            sb.table("tryon_results")
            .select("id, storage_path, thumbnail_storage_path")
            .in_("id", tryon_ids)
            .execute()
        )
        for t in trs.data or []:
            storage_by_id[str(t["id"])] = t

    out: list[dict[str, Any]] = []
    for row in rows:
        tr_id = row.get("tryon_result_id")
        signed_main: str | None = None
        signed_thumb: str | None = None
        if tr_id and str(tr_id) in storage_by_id:
            sp = storage_by_id[str(tr_id)]
            signed_main = _sign_one(sb, "tryon-results", sp.get("storage_path"))
            signed_thumb = _sign_one(
                sb, "tryon-results", sp.get("thumbnail_storage_path")
            )
        out.append(
            _project_post_row(
                row,
                signed_image_url=signed_main,
                signed_thumbnail_url=signed_thumb,
            )
        )
    return out


# --- External web results: cache + job enqueue ------------------------------


def find_cached_web_results(
    sb: Any, *, canonical_url_hash: str, provider: str
) -> dict[str, Any] | None:
    """Return an unexpired cache row for (product, provider, prompt_version), or None."""
    res = (
        sb.table("reverse_search_results")
        .select("id, web_results, fetched_at, expires_at")
        .eq("canonical_url_hash", canonical_url_hash)
        .eq("provider", provider)
        .eq("prompt_version", PROMPT_VERSION)
        .is_("deleted_at", "null")
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    row = rows[0]
    if not isinstance(row, dict):
        return None
    # Expired rows are returned by the index's fetched_at ordering but must
    # not be served. The partial unique index filters expired rows out of
    # uniqueness, not out of SELECT.
    from datetime import UTC, datetime

    exp = row.get("expires_at")
    if isinstance(exp, str):
        try:
            # PostgREST serializes TIMESTAMPTZ as ISO-8601 with "+00:00".
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        except ValueError:
            return None
        if exp_dt <= datetime.now(UTC):
            return None
    # Cached rows with zero web matches are not served as hits: otherwise the API
    # returns cache_hit=true forever, POST never enqueues a job, and the worker
    # stays idle while the UI shows an empty "Around the web" grid (Retry cannot
    # refresh until TTL or prompt_version bumps).
    web = row.get("web_results")
    if not isinstance(web, list) or len(web) == 0:
        return None
    return row


def enqueue_web_results_job(
    sb: Any,
    *,
    user_id: str,
    product_id: str | None,
    canonical_url_hash: str,
    provider: str,
) -> str:
    """Insert a `reverse_search_jobs` row; returns the new `id`."""
    payload: dict[str, Any] = {
        "user_id": user_id,
        "canonical_url_hash": canonical_url_hash,
        "provider": provider,
        "prompt_version": PROMPT_VERSION,
    }
    if product_id:
        payload["product_id"] = product_id
    ins = sb.table("reverse_search_jobs").insert(payload).execute()
    rows = ins.data or []
    if not rows or not isinstance(rows[0], dict):
        msg = "reverse_search_jobs insert returned no row"
        raise RuntimeError(msg)
    jid = rows[0].get("id")
    if not isinstance(jid, str):
        raise RuntimeError("reverse_search_jobs insert returned no id")
    try:
        uuid.UUID(jid)
    except ValueError as exc:
        # Shouldn't happen against real Postgres (the column is UUID-typed) but
        # guards against stubs and returns a clearer error than a ValueError
        # bubbling from deep inside the insert path.
        raise RuntimeError(
            f"reverse_search_jobs insert returned non-UUID id: {jid!r}"
        ) from exc
    return jid


def fetch_job(
    sb: Any, *, user_id: str, job_id: str
) -> dict[str, Any] | None:
    """Shape-check + filter-by-user poll helper for the GET endpoint."""
    res = (
        sb.table("reverse_search_jobs")
        .select("id, status, error_code, error_message, result_id")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    job = rows[0]
    out: dict[str, Any] = {
        "job_id": job_id,
        "status": str(job.get("status") or "queued"),
    }
    if job.get("status") == "completed" and job.get("result_id"):
        rres = (
            sb.table("reverse_search_results")
            .select("web_results")
            .eq("id", job["result_id"])
            .limit(1)
            .execute()
        )
        rrows = rres.data or []
        if rrows:
            web = rrows[0].get("web_results")
            out["web_results"] = web if isinstance(web, list) else []
    elif job.get("status") == "failed":
        out["error_code"] = job.get("error_code")
        out["error_message"] = job.get("error_message")
    return out

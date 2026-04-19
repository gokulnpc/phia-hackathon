"""Service layer for fit-score: cache lookup, job enqueue, result shaping."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from mirror.core.fit_score.closet_snapshot import OwnedSnapshot, fetch_owned_snapshot
from mirror.core.product_catalog import upsert_product_from_extracted
from mirror.integrations.gemini_fit_score import PROMPT_VERSION


@dataclass
class SubmitOutcome:
    status: str  # "completed" | "queued" | "empty_closet"
    cache_hit: bool
    job_id: str | None
    result: dict[str, Any] | None
    cta: str | None = None


def _result_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "overall_score": int(row["overall_score"]),
        "breakdown": row["breakdown"],
        "matching_items": row.get("matching_items") or [],
        "conflicts": row.get("conflicts") or [],
        "explanation": str(row.get("explanation") or ""),
        "confidence": str(row.get("confidence") or "medium"),
        "generated_at": row.get("generated_at"),
    }


def _find_cached_result(
    sb: Any,
    *,
    user_id: str,
    product_fingerprint: str,
    closet_revision_hash: str,
    prompt_version: int,
) -> dict[str, Any] | None:
    res = (
        sb.table("fit_score_results")
        .select("*")
        .eq("user_id", user_id)
        .eq("product_fingerprint", product_fingerprint)
        .eq("closet_revision_hash", closet_revision_hash)
        .eq("prompt_version", prompt_version)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    row = rows[0]
    return row if isinstance(row, dict) else None


def _enqueue_job(
    sb: Any,
    *,
    user_id: str,
    product_id: str,
    product_fingerprint: str,
    product_metadata: dict[str, Any],
    closet_revision_hash: str,
) -> str:
    ins = (
        sb.table("fit_score_jobs")
        .insert(
            {
                "user_id": user_id,
                "product_id": product_id,
                "product_fingerprint": product_fingerprint,
                "product_metadata": product_metadata,
                "closet_revision_hash": closet_revision_hash,
                "prompt_version": PROMPT_VERSION,
            }
        )
        .execute()
    )
    rows = ins.data or []
    if not rows or not isinstance(rows[0], dict) or "id" not in rows[0]:
        msg = "fit_score_jobs insert returned no id"
        raise RuntimeError(msg)
    return str(rows[0]["id"])


def submit_fit_score(
    sb: Any, *, user_id: str, url: str, extracted: dict[str, Any]
) -> SubmitOutcome:
    """Resolve product, snapshot the closet, try cache, otherwise enqueue a job."""
    product = upsert_product_from_extracted(sb, url, extracted)
    product_id = str(product["id"])
    fingerprint = str(product.get("fingerprint") or "")
    if not fingerprint:
        msg = "product missing fingerprint"
        raise RuntimeError(msg)

    snapshot: OwnedSnapshot = fetch_owned_snapshot(sb, user_id)
    if snapshot.count == 0:
        return SubmitOutcome(
            status="empty_closet",
            cache_hit=False,
            job_id=None,
            result=None,
            cta="Save items to your closet as Owned to unlock fit score.",
        )

    cached = _find_cached_result(
        sb,
        user_id=user_id,
        product_fingerprint=fingerprint,
        closet_revision_hash=snapshot.revision_hash,
        prompt_version=PROMPT_VERSION,
    )
    if cached is not None:
        return SubmitOutcome(
            status="completed",
            cache_hit=True,
            job_id=f"cached-{cached['id']}",
            result=_result_row_to_payload(cached),
        )

    product_metadata = {
        "name": product.get("name"),
        "brand": product.get("brand"),
        "category": product.get("category"),
        "color": product.get("color"),
        "primary_image_url": product.get("primary_image_url"),
        "price_usd": product.get("price_usd"),
    }
    jid = _enqueue_job(
        sb,
        user_id=user_id,
        product_id=product_id,
        product_fingerprint=fingerprint,
        product_metadata=product_metadata,
        closet_revision_hash=snapshot.revision_hash,
    )
    return SubmitOutcome(
        status="queued",
        cache_hit=False,
        job_id=jid,
        result=None,
    )


def fetch_job_with_result(
    sb: Any, *, user_id: str, job_id: str
) -> dict[str, Any] | None:
    """Return a job row with optional inlined result for the poll endpoint."""
    if job_id.startswith("cached-"):
        rid = job_id.removeprefix("cached-")
        res = (
            sb.table("fit_score_results")
            .select("*")
            .eq("id", rid)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        return {
            "job_id": job_id,
            "status": "completed",
            "result": _result_row_to_payload(rows[0]),
        }

    res = (
        sb.table("fit_score_jobs")
        .select("*")
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
        "status": job["status"],
    }
    if job["status"] == "completed" and job.get("result_id"):
        rres = (
            sb.table("fit_score_results")
            .select("*")
            .eq("id", job["result_id"])
            .limit(1)
            .execute()
        )
        rrows = rres.data or []
        if rrows:
            out["result"] = _result_row_to_payload(rrows[0])
    elif job["status"] == "failed":
        out["error_code"] = job.get("error_code")
        out["error_message"] = job.get("error_message")
    return out

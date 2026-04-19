from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from supabase import Client

from mirror.core.errors import TryOnError, ValidationError

log = structlog.get_logger()


def product_image_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


def get_active_reference_photo(client: Client, user_id: str) -> dict[str, Any]:
    res = (
        client.table("reference_photos")
        .select("id, storage_path, consent_id")
        .eq("user_id", user_id)
        .eq("status", "active")
        .is_("deleted_at", "null")
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise TryOnError("TRYON_NO_AVATAR", "Upload a reference photo before trying on.")
    return rows[0]


def get_product_primary_image_url(client: Client, product_id: str) -> str:
    res = (
        client.table("products").select("primary_image_url").eq("id", product_id).limit(1).execute()
    )
    rows = res.data or []
    if not rows:
        raise ValidationError("NOT_FOUND_PRODUCT", "Unknown product_id")
    url = rows[0].get("primary_image_url")
    if not isinstance(url, str) or not url:
        raise ValidationError("VALIDATION_MISSING_PRODUCT", "Product has no primary image")
    return url


def get_owned_tryon_result_for_model_ref(
    client: Client, *, user_id: str, result_id: str
) -> dict[str, Any]:
    res = (
        client.table("tryon_results")
        .select("id, storage_path, user_id")
        .eq("id", result_id)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise ValidationError(
            "NOT_FOUND_TRYON_RESULT",
            "Unknown or inaccessible try-on result for model reference",
        )
    row = rows[0]
    sp = row.get("storage_path")
    if not isinstance(sp, str) or not sp.strip():
        raise ValidationError(
            "VALIDATION_BAD_REQUEST",
            "Try-on result has no storage path",
        )
    return row


def find_cached_result(client: Client, user_id: str, image_hash: str) -> dict[str, Any] | None:
    res = (
        client.table("tryon_results")
        .select("*")
        .eq("user_id", user_id)
        .eq("product_image_hash", image_hash)
        .is_("deleted_at", "null")
        .is_("source_result_id", "null")
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def signed_tryon_urls(client: Client, row: dict[str, Any]) -> tuple[str, str, datetime]:
    exp = 300
    main = client.storage.from_("tryon-results").create_signed_url(row["storage_path"], exp)
    thumb = client.storage.from_("tryon-results").create_signed_url(
        row["thumbnail_storage_path"], exp
    )
    signed_main = main.get("signedURL") or main.get("signedUrl")
    signed_thumb = thumb.get("signedURL") or thumb.get("signedUrl")
    if not isinstance(signed_main, str) or not isinstance(signed_thumb, str):
        raise RuntimeError("Could not create signed URLs for try-on result")
    expires_at = datetime.now(UTC) + timedelta(seconds=exp)
    return signed_main, signed_thumb, expires_at


def enqueue_tryon_editorial_job(
    client: Client,
    *,
    user_id: str,
    source_tryon_result_id: str,
) -> str:
    """Queue a Gemini editorial pass over an existing primary try-on result."""
    res = (
        client.table("tryon_results")
        .select("id, source_result_id")
        .eq("id", source_tryon_result_id)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise ValidationError("NOT_FOUND_TRYON_RESULT", "Try-on result not found")
    row = rows[0]
    if row.get("source_result_id") is not None:
        raise ValidationError(
            "EDITORIAL_INVALID_SOURCE",
            "Use the original try-on image as the source, not an editorial derivative.",
        )
    trace_id = str(uuid.uuid4())
    ins = (
        client.table("tryon_editorial_jobs")
        .insert(
            {
                "user_id": user_id,
                "source_tryon_result_id": source_tryon_result_id,
                "status": "queued",
                "priority": 5,
                "trace_id": trace_id,
            }
        )
        .execute()
    )
    data = ins.data
    if not data:
        log.error("tryon_editorial_insert_failed", response=ins)
        raise TryOnError("INTERNAL_TRYON", "Could not create editorial job")
    jid = data[0].get("id")
    if not isinstance(jid, str):
        raise TryOnError("INTERNAL_TRYON", "Invalid editorial job id")
    return jid


def enqueue_tryon_job(
    client: Client,
    *,
    user_id: str,
    product_id: str | None,
    product_image_url: str,
    product_metadata: dict[str, Any],
    mode: str,
    priority: int,
    reference_photo_id: str,
    model_reference_tryon_result_id: str | None = None,
) -> str:
    h = product_image_hash(product_image_url)
    trace_id = str(uuid.uuid4())
    row: dict[str, Any] = {
        "user_id": user_id,
        "product_id": product_id,
        "product_image_url": product_image_url,
        "product_image_hash": h,
        "product_metadata": product_metadata,
        "mode": mode,
        "reference_photo_id": reference_photo_id,
        "status": "queued",
        "priority": priority,
        "trace_id": trace_id,
    }
    if model_reference_tryon_result_id:
        row["model_reference_tryon_result_id"] = model_reference_tryon_result_id
    res = client.table("tryon_jobs").insert(row).execute()
    data = res.data
    if not data:
        log.error("tryon_insert_failed", response=res)
        raise TryOnError("INTERNAL_TRYON", "Could not create try-on job")
    jid = data[0].get("id")
    if not isinstance(jid, str):
        raise TryOnError("INTERNAL_TRYON", "Invalid job id")
    return jid


def parse_tryon_request(
    body: dict[str, Any],
) -> tuple[str | None, str | None, dict[str, Any], str, int]:
    product_id = body.get("product_id")
    if product_id is not None and not isinstance(product_id, str):
        raise ValidationError("VALIDATION_BAD_REQUEST", "product_id must be a string")
    product_image_url = body.get("product_image_url")
    if isinstance(product_image_url, str) and product_image_url.strip():
        url = product_image_url.strip()
    else:
        url = None
    if url is None and not product_id:
        raise ValidationError(
            "VALIDATION_MISSING_PRODUCT",
            "product_image_url or product_id is required",
        )
    meta = body.get("product_metadata")
    if meta is None:
        meta_dict: dict[str, Any] = {}
    elif isinstance(meta, dict):
        meta_dict = dict(meta)
    else:
        raise ValidationError("VALIDATION_BAD_REQUEST", "product_metadata must be an object")
    mode = body.get("mode", "standard")
    if mode not in ("standard", "quality", "fast"):
        raise ValidationError("VALIDATION_BAD_REQUEST", "invalid mode")
    priority = body.get("priority", 5)
    if not isinstance(priority, int) or priority < 1 or priority > 10:
        priority = 5
    return product_id, url, meta_dict, str(mode), int(priority)


def parse_model_reference_tryon_result_id(body: dict[str, Any]) -> str | None:
    raw = body.get("model_reference_tryon_result_id")
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str):
        raise ValidationError(
            "VALIDATION_BAD_REQUEST",
            "model_reference_tryon_result_id must be a string UUID",
        )
    s = raw.strip()
    if not s:
        return None
    return s


def error_response(code: str, message: str, trace_id: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": {}, "trace_id": trace_id}}

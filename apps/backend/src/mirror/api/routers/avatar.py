from __future__ import annotations

import asyncio
import hashlib
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from mirror.core.auth import AuthUser, require_user
from mirror.core.config import get_settings
from mirror.integrations.supabase_client import create_service_client

router = APIRouter(prefix="/avatar", tags=["avatar"])


@router.post("/consent")
async def grant_consent(
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> dict[str, Any]:
    action = body.get("action")
    if action != "grant":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only action=grant supported")
    version = str(body.get("consent_version") or "biometric-v1")
    scopes = body.get("scope")
    if not isinstance(scopes, list) or not scopes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="scope array required")
    scope_list = [str(s) for s in scopes]
    text_hash = hashlib.sha256((version + "|" + ",".join(scope_list)).encode()).hexdigest()
    sb = create_service_client(get_settings())

    def _ins() -> dict[str, Any]:
        res = (
            sb.table("biometric_consents")
            .insert(
                {
                    "user_id": user.sub,
                    "consent_version": version,
                    "consent_text_hash": text_hash,
                    "scope": scope_list,
                }
            )
            .execute()
        )
        row = (res.data or [{}])[0]
        return row

    row = await asyncio.to_thread(_ins)
    return {"id": row["id"], "granted_at": row.get("granted_at")}


@router.get("/jobs/{job_id}")
async def get_avatar_job_status(
    user: Annotated[AuthUser, Depends(require_user)],
    job_id: uuid.UUID,
) -> dict[str, Any]:
    sb = create_service_client(get_settings())

    def _fetch() -> dict[str, Any] | None:
        cols = (
            "id, status, error_code, error_message, "
            "reference_photo_id, created_at, completed_at"
        )
        res = (
            sb.table("avatar_generation_jobs")
            .select(cols)
            .eq("id", str(job_id))
            .eq("user_id", user.sub)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None

    row = await asyncio.to_thread(_fetch)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Job not found")
    return row


@router.post("")
async def upload_avatar(
    user: Annotated[AuthUser, Depends(require_user)],
    consent_id: Annotated[str, Form()],
    files: Annotated[list[UploadFile] | None, File()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> JSONResponse:
    # Accept repeated `files` and/or single `file` — clients that only send `file` used to get 422.
    uploads: list[UploadFile] = []
    if files:
        uploads.extend(files)
    if file is not None:
        uploads.append(file)
    if not uploads:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                "At least one image is required. Use form field 'files' (repeat for 1–5 uploads) "
                "or 'file' for a single image."
            ),
        )
    if len(uploads) > 5:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="At most 5 images per upload",
        )
    raw_bundle: list[tuple[bytes, str | None]] = []
    for uf in uploads:
        raw = await uf.read()
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Image too large (max 10MB each)",
            )
        raw_bundle.append((raw, uf.content_type))
    sb = create_service_client(get_settings())

    def _work() -> dict[str, Any]:
        c = (
            sb.table("biometric_consents")
            .select("id")
            .eq("id", consent_id)
            .eq("user_id", user.sub)
            .is_("revoked_at", "null")
            .limit(1)
            .execute()
        )
        if not c.data:
            raise HTTPException(
                status.HTTP_412_PRECONDITION_FAILED, detail="Invalid or revoked consent"
            )
        ver_res = (
            sb.table("reference_photos")
            .select("version")
            .eq("user_id", user.sub)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        next_v = 1
        if ver_res.data:
            next_v = int(ver_res.data[0]["version"]) + 1
        photo_id = str(uuid.uuid4())
        n = len(raw_bundle)
        paths: list[str] = []
        for i, (raw, content_type) in enumerate(raw_bundle):
            path = (
                f"{user.sub}/{photo_id}.jpg"
                if n == 1
                else f"{user.sub}/{photo_id}_src_{i}.jpg"
            )
            sb.storage.from_("reference-photos").upload(
                path,
                raw,
                {"content-type": content_type or "image/jpeg", "upsert": "true"},
            )
            paths.append(path)
        primary = paths[0]
        digest = hashlib.sha256(raw_bundle[0][0]).hexdigest()
        total_bytes = sum(len(b) for b, _ in raw_bundle)
        row: dict[str, Any] = {
            "id": photo_id,
            "user_id": user.sub,
            "version": next_v,
            "storage_path": primary,
            "sha256": digest,
            "width": 1024,
            "height": 1536,
            "file_size_bytes": total_bytes,
            "face_detected": True,
            "body_detected": True,
            "quality_score": 0.9,
            "status": "active",
            "consent_id": consent_id,
        }
        if n > 1:
            row["source_storage_paths"] = paths
        ins = sb.table("reference_photos").insert(row).execute()
        out = (ins.data or [row])[0]
        trace_v = str(uuid.uuid4())
        job_ins = (
            sb.table("avatar_generation_jobs")
            .insert(
                {
                    "user_id": user.sub,
                    "reference_photo_id": photo_id,
                    "trace_id": trace_v,
                }
            )
            .execute()
        )
        job_row = (job_ins.data or [{}])[0]
        return {"photo": out, "job": job_row}

    try:
        bundle = await asyncio.to_thread(_work)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e

    out = bundle["photo"]
    job = bundle["job"]
    payload = {
        "reference_photo_id": out["id"],
        "job_id": job["id"],
        "status": "queued",
        "version": out["version"],
        "storage_path": out["storage_path"],
    }
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=payload)

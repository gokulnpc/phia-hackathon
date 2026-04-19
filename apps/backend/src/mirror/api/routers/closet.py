from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from mirror.core.auth import AuthUser, require_user
from mirror.core.closet.enrichment import enqueue_enrichment
from mirror.core.config import get_settings
from mirror.core.product_catalog import upsert_product_from_extracted
from mirror.integrations.supabase_client import create_service_client

router = APIRouter(prefix="/closet", tags=["closet"])


def _save_wishlist(sb: Any, user_sub: str, url: str, extracted: dict[str, Any]) -> dict[str, Any]:
    product = upsert_product_from_extracted(sb, url, extracted)
    pid = str(product["id"])
    dup = (
        sb.table("closet_items")
        .select("id")
        .eq("user_id", user_sub)
        .eq("product_id", pid)
        .eq("kind", "wishlist")
        .limit(1)
        .execute()
    )
    rows = dup.data or []
    if rows:
        cid = str(rows[0]["id"])
        enqueue_enrichment(sb, user_sub, cid)
        return {
            "already_saved": True,
            "closet_item_id": cid,
            "product_id": pid,
        }
    ins = (
        sb.table("closet_items")
        .insert(
            {
                "user_id": user_sub,
                "product_id": pid,
                "kind": "wishlist",
            }
        )
        .execute()
    )
    inserted = ins.data or []
    if not inserted or not isinstance(inserted[0], dict) or "id" not in inserted[0]:
        msg = "closet_items insert returned no id"
        raise RuntimeError(msg)
    cid = str(inserted[0]["id"])
    enqueue_enrichment(sb, user_sub, cid)
    return {
        "already_saved": False,
        "closet_item_id": cid,
        "product_id": pid,
    }


def _save_owned(sb: Any, user_sub: str, url: str, extracted: dict[str, Any]) -> dict[str, Any]:
    product = upsert_product_from_extracted(sb, url, extracted)
    pid = str(product["id"])
    dup = (
        sb.table("closet_items")
        .select("id")
        .eq("user_id", user_sub)
        .eq("product_id", pid)
        .eq("kind", "owned")
        .limit(1)
        .execute()
    )
    rows = dup.data or []
    if rows:
        cid = str(rows[0]["id"])
        enqueue_enrichment(sb, user_sub, cid)
        return {
            "already_saved": True,
            "closet_item_id": cid,
            "product_id": pid,
        }
    ins = (
        sb.table("closet_items")
        .insert(
            {
                "user_id": user_sub,
                "product_id": pid,
                "kind": "owned",
            }
        )
        .execute()
    )
    inserted = ins.data or []
    if not inserted or not isinstance(inserted[0], dict) or "id" not in inserted[0]:
        msg = "closet_items insert returned no id"
        raise RuntimeError(msg)
    cid = str(inserted[0]["id"])
    enqueue_enrichment(sb, user_sub, cid)
    return {
        "already_saved": False,
        "closet_item_id": cid,
        "product_id": pid,
    }


@router.post("/wishlist")
async def add_wishlist(
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> dict[str, Any]:
    url = body.get("url")
    extracted = body.get("extracted") or {}
    if not isinstance(url, str) or not url.strip():
        return {"error": "url required"}
    if not isinstance(extracted, dict):
        extracted = {}
    sb = create_service_client(get_settings())
    return await asyncio.to_thread(_save_wishlist, sb, user.sub, url.strip(), extracted)


@router.post("/owned")
async def add_owned(
    user: Annotated[AuthUser, Depends(require_user)],
    body: dict[str, Any],
) -> dict[str, Any]:
    url = body.get("url")
    extracted = body.get("extracted") or {}
    if not isinstance(url, str) or not url.strip():
        return {"error": "url required"}
    if not isinstance(extracted, dict):
        extracted = {}
    sb = create_service_client(get_settings())
    return await asyncio.to_thread(_save_owned, sb, user.sub, url.strip(), extracted)

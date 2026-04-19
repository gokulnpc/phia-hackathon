from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from mirror.core.auth import AuthUser, require_user
from mirror.core.config import get_settings
from mirror.core.product_catalog import upsert_product_from_extracted
from mirror.integrations.supabase_client import create_service_client

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/rules")
async def list_rules(
    _user: Annotated[AuthUser, Depends(require_user)],
) -> dict[str, Any]:
    sb = create_service_client(get_settings())

    def _load() -> list[dict[str, Any]]:
        res = (
            sb.table("product_detection_rules")
            .select("*")
            .eq("active", True)
            .order("priority")
            .execute()
        )
        return list(res.data or [])

    rules = await asyncio.to_thread(_load)
    return {"rules": rules}


@router.post("/detect")
async def detect(
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

    def _upsert() -> dict[str, Any]:
        return upsert_product_from_extracted(sb, url, extracted)

    product = await asyncio.to_thread(_upsert)
    return {
        "product": {
            "id": product["id"],
            "canonical_url": product["canonical_url"],
            "name": product["name"],
            "brand": product.get("brand"),
            "category": product.get("category"),
            "primary_image_url": product["primary_image_url"],
            "price_usd": float(product["price_usd"])
            if product.get("price_usd") is not None
            else None,
            "currency": product.get("currency") or "USD",
            "fingerprint": product["fingerprint"],
        },
        "detection_method": "client_extracted",
        "confidence": 0.9,
    }

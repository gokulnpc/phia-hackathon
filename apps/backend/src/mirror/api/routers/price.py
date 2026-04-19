from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from mirror.core.auth import AuthUser, require_user

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/price/mock")
def mock_price(
    _user: Annotated[AuthUser, Depends(require_user)],
    price_usd: float | None = Query(default=None),
    brand: str | None = Query(default=None),
) -> dict[str, Any]:
    base = float(price_usd or 99.0)
    lowest = round(base * 0.75, 2)
    return {
        "comparison": {
            "current_price": base,
            "currency": "USD",
            "lowest_price": lowest,
            "lowest_price_source": "Mock Outlet",
            "lowest_price_url": "https://example.com",
            "retailers": [
                {
                    "name": "Current site",
                    "price": base,
                    "url": "https://example.com",
                    "in_stock": True,
                },
                {
                    "name": "Mock Outlet",
                    "price": lowest,
                    "url": "https://example.com",
                    "in_stock": True,
                },
            ],
        },
        "resale": {
            "retained_value_pct": 0.65 if (brand or "").lower() == "nike" else 0.45,
            "brand_resale_score": "good",
            "average_resale_price": round(base * 0.55, 2),
            "liquidity": "medium",
        },
        "source": "mock",
        "cached": False,
        "brand": brand,
    }

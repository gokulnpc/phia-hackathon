"""Zara `BrandTuning` — delegates to the existing zara_query / zara_fetch modules.

New brands should live in their own module in this package; the worker
never imports brand modules directly — everything goes through the
registry in `__init__.py`.
"""

from __future__ import annotations

from typing import Any

from mirror.core.visual_search.zara_fetch import maybe_refresh_zara_product
from mirror.core.visual_search.zara_query import (
    ZaraQueries,
    build_zara_queries,
    is_zara_product,
)


class ZaraBrand:
    name = "zara"

    def matches(self, product: dict[str, Any]) -> bool:
        return is_zara_product(product)

    async def refresh_product(
        self, sb: Any, product: dict[str, Any]
    ) -> dict[str, Any]:
        return await maybe_refresh_zara_product(sb, product)

    def build_queries(
        self, product: dict[str, Any], *, image_url: str
    ) -> ZaraQueries | None:
        return build_zara_queries(product, image_url=image_url)

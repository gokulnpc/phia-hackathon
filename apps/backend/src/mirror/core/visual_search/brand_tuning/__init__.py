"""Brand-specific visual-search tuning.

Each brand can plug in (a) a product-row refresher that cleans up noisy
PDP metadata (Zara serves "Zara USA" as the title in the DOM) and (b) a
query builder that turns a product into Pinterest/Instagram/Lens search
terms tuned for the brand's catalog structure.

The worker talks to this registry; individual brand modules stay isolated.

Add a brand:
  1. Drop a module in this package.
  2. Implement the `BrandTuning` protocol.
  3. Register an instance in `_REGISTRY` below.
"""

from __future__ import annotations

from typing import Any, Protocol

from mirror.core.visual_search.brand_tuning.zara import ZaraBrand
from mirror.core.visual_search.zara_query import ZaraQueries

# For now every tuning returns `ZaraQueries` (the shape is generic enough —
# keyword + boards + hashtags + reference code). If a future brand needs a
# different query shape, rename `ZaraQueries` → `BrandQueries` and make this
# type an alias.
BrandQueries = ZaraQueries


class BrandTuning(Protocol):
    """Brand-specific hooks the reverse-search worker consults per job."""

    name: str

    def matches(self, product: dict[str, Any]) -> bool:
        """Return True iff this tuning should be used for the given product row."""
        ...

    async def refresh_product(
        self, sb: Any, product: dict[str, Any]
    ) -> dict[str, Any]:
        """Optionally re-fetch + clean the product row. Return unchanged if no-op."""
        ...

    def build_queries(
        self, product: dict[str, Any], *, image_url: str
    ) -> BrandQueries | None:
        """Build structured search terms for the composite provider."""
        ...


# Order matters: first match wins. Keep the list small and add brands here
# as standalone modules (`./mango.py`, `./uniqlo.py`, etc).
_REGISTRY: list[BrandTuning] = [
    ZaraBrand(),
]


def get_brand_tuning(product: dict[str, Any] | None) -> BrandTuning | None:
    """Return the first registered `BrandTuning` that matches this product, or None."""
    if not product:
        return None
    for tuning in _REGISTRY:
        if tuning.matches(product):
            return tuning
    return None


__all__ = ["BrandQueries", "BrandTuning", "get_brand_tuning"]

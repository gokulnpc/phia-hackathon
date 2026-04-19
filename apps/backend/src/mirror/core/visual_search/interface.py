"""Visual-search provider contract.

Providers return `RawVisualMatch` — the raw-ish result before the service
layer post-processes (person-filter, dedup, ranking). Keeping providers
ignorant of post-processing lets us swap or stack them later without
rewriting filters.
"""

from __future__ import annotations

from typing import Protocol, TypedDict

from mirror.core.config import Settings
from mirror.core.visual_search.zara_query import ZaraQueries


class RawVisualMatch(TypedDict):
    """One candidate result from a visual-search provider."""

    image_url: str  # URL to the image itself (may be a thumbnail or full res)
    source_url: str  # Page the image was found on
    source_host: str  # e.g. "instagram.com", "pinterest.com"
    title: str  # Best-effort text label (may be empty)
    visual_score: float  # 0.0 - 1.0, provider-assigned rank signal


class VisualSearchProvider(Protocol):
    """Async provider that turns a candidate product into visual matches."""

    name: str

    def is_available(self, settings: Settings) -> bool:
        """Return True iff credentials / config for this provider are present."""
        ...

    async def lookup(
        self,
        *,
        candidate_image_url: str,
        candidate_image_bytes: bytes | None,
        candidate_text_query: str,
        candidate_queries: ZaraQueries | None = None,
        limit: int = 20,
    ) -> list[RawVisualMatch]:
        """Fetch visual matches for a candidate product.

        Providers should raise `mirror.core.errors.ProviderError` (with a
        `<NAME>_*` code) for upstream failures — configuration, quota,
        timeout, or unparseable response.
        """
        ...

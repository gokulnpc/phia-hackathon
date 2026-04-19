"""Deterministic mock provider — useful for local dev + unit tests.

Fixtures are seeded by a SHA-256 of the candidate text query, so the same
input always yields the same output (tests can assert on stable values).
No network I/O; no API key required.
"""

from __future__ import annotations

import hashlib

from mirror.core.config import Settings
from mirror.core.visual_search.interface import RawVisualMatch

_FIXTURE_HOSTS = (
    "lookbook.example.com",
    "street.example.com",
    "editorial.example.com",
    "community.example.com",
)


class MockProvider:
    name = "mock"

    def is_available(self, settings: Settings) -> bool:  # noqa: ARG002
        return True

    async def lookup(
        self,
        *,
        candidate_image_url: str,  # noqa: ARG002
        candidate_image_bytes: bytes | None,  # noqa: ARG002
        candidate_text_query: str,
        candidate_queries: object | None = None,  # noqa: ARG002
        limit: int = 20,
    ) -> list[RawVisualMatch]:
        seed = hashlib.sha256(candidate_text_query.encode()).hexdigest()
        count = min(max(limit, 1), len(_FIXTURE_HOSTS))
        results: list[RawVisualMatch] = []
        for i in range(count):
            host = _FIXTURE_HOSTS[i]
            seed_i = f"{seed[: 16 - i]}{i}"
            match: RawVisualMatch = {
                "image_url": f"https://picsum.photos/seed/{seed_i}/400/500",
                "source_url": f"https://{host}/posts/{seed_i}",
                "source_host": host,
                "title": f"Mock match {i + 1} for {candidate_text_query[:40]}".strip(),
                "visual_score": round(1.0 - (i * 0.15), 3),
            }
            results.append(match)
        return results

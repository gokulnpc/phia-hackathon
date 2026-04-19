"""Composite visual-search merge logic (dedupe + host weights)."""

from __future__ import annotations

import pytest

from mirror.core.config import Settings
from mirror.core.visual_search.composite import CompositeProvider
from mirror.core.visual_search.interface import RawVisualMatch
from mirror.core.visual_search.zara_query import ZaraQueries


@pytest.mark.asyncio
async def test_composite_merges_and_dedupes(monkeypatch: pytest.MonkeyPatch) -> None:
    p = CompositeProvider()

    pin: RawVisualMatch = {
        "image_url": "https://i.pinimg.com/originals/ab/c.jpg",
        "source_url": "https://www.pinterest.com/pin/1/",
        "source_host": "pinterest.com",
        "title": "Pin",
        "visual_score": 0.9,
    }
    ig: RawVisualMatch = {
        "image_url": "https://instagram.com/x.jpg",
        "source_url": "https://www.instagram.com/p/abc/",
        "source_host": "instagram.com",
        "title": "IG",
        "visual_score": 0.95,
    }
    dup_pin: RawVisualMatch = {
        "image_url": "https://i.pinimg.com/originals/ab/c.jpg?v=2",
        "source_url": "https://www.pinterest.com/pin/2/",
        "source_host": "pinterest.com",
        "title": "Dup",
        "visual_score": 0.5,
    }

    async def fake_pin(**_: object) -> list[RawVisualMatch]:
        return [pin, dup_pin]

    async def fake_ig(**_: object) -> list[RawVisualMatch]:
        return [ig]

    async def fake_lens(**_: object) -> list[RawVisualMatch]:
        return []

    monkeypatch.setattr(p._pinterest, "is_available", lambda _s: True)
    monkeypatch.setattr(p._instagram, "is_available", lambda _s: True)
    monkeypatch.setattr(p._lens, "is_available", lambda _s: False)
    monkeypatch.setattr(p._pinterest, "lookup", fake_pin)
    monkeypatch.setattr(p._instagram, "lookup", fake_ig)
    monkeypatch.setattr(p._lens, "lookup", fake_lens)

    monkeypatch.setattr(
        "mirror.core.visual_search.composite.get_settings",
        lambda: Settings(visual_search_composite_per_provider_timeout_s=5.0),
    )

    out = await p.lookup(
        candidate_image_url="https://cdn.zara.com/h.jpg",
        candidate_image_bytes=None,
        candidate_text_query="x",
        candidate_queries=None,
        limit=10,
    )
    assert len(out) == 2  # dup_pin merges with pin via normalized pinimg key
    hosts = {x["source_host"] for x in out}
    assert "pinterest.com" in hosts
    assert "instagram.com" in hosts


@pytest.mark.asyncio
async def test_lens_outranks_instagram_at_same_image_dedupe_quality(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SerpAPI Lens rows get a higher source multiplier than hashtag Instagram."""
    p = CompositeProvider()

    lens_row: RawVisualMatch = {
        "image_url": "https://cdn.example.com/lens-thumb.jpg",
        "source_url": "https://www.shop.com/p/1",
        "source_host": "shop.com",
        "title": "lens",
        "visual_score": 0.55,
    }
    ig_row: RawVisualMatch = {
        "image_url": "https://cdn.example.com/ig.jpg",
        "source_url": "https://www.instagram.com/p/zz/",
        "source_host": "instagram.com",
        "title": "ig",
        "visual_score": 0.98,
    }

    async def fake_pin(**_: object) -> list[RawVisualMatch]:
        return []

    async def fake_ig(**_: object) -> list[RawVisualMatch]:
        return [ig_row]

    async def fake_lens(**_: object) -> list[RawVisualMatch]:
        return [lens_row]

    monkeypatch.setattr(p._pinterest, "is_available", lambda _s: True)
    monkeypatch.setattr(p._instagram, "is_available", lambda _s: True)
    monkeypatch.setattr(p._lens, "is_available", lambda _s: True)
    monkeypatch.setattr(p._pinterest, "lookup", fake_pin)
    monkeypatch.setattr(p._instagram, "lookup", fake_ig)
    monkeypatch.setattr(p._lens, "lookup", fake_lens)

    monkeypatch.setattr(
        "mirror.core.visual_search.composite.get_settings",
        lambda: Settings(visual_search_composite_per_provider_timeout_s=5.0),
    )

    out = await p.lookup(
        candidate_image_url="https://cdn.zara.com/h.jpg",
        candidate_image_bytes=None,
        candidate_text_query="dress",
        candidate_queries=ZaraQueries(
            pinterest_keyword="x",
            pinterest_boards=[],
            instagram_hashtags=["zara"],
            image_url="",
        ),
        limit=10,
    )
    assert out[0]["title"] == "lens"
    assert out[0]["source_url"] == lens_row["source_url"]

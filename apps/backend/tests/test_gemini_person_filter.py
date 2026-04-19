"""Unit tests for the person-filter response normalizer (no live Gemini calls)."""

from __future__ import annotations

import pytest

from mirror.core.config import Settings
from mirror.integrations.gemini_person_filter import (
    filter_images_for_persons,
    parse_filter_response,
)


def test_parse_empty_results_keeps_all() -> None:
    assert parse_filter_response({}, 3) == [True, True, True]
    assert parse_filter_response({"results": "garbage"}, 2) == [True, True]


def test_parse_applies_per_index_bools() -> None:
    raw = {
        "results": [
            {"index": 0, "person_visible": True, "reason": "full body"},
            {"index": 1, "person_visible": False, "reason": "flatlay"},
            {"index": 2, "person_visible": True, "reason": "torso"},
        ]
    }
    assert parse_filter_response(raw, 3) == [True, False, True]


def test_parse_ignores_out_of_range_indices() -> None:
    raw = {
        "results": [
            {"index": 0, "person_visible": False, "reason": "logo"},
            {"index": 99, "person_visible": False, "reason": "ignored"},
            {"index": -1, "person_visible": False, "reason": "ignored"},
        ]
    }
    # Out-of-range entries are dropped; only index 0 flips.
    assert parse_filter_response(raw, 2) == [False, True]


def test_parse_biases_toward_keep_on_malformed_entries() -> None:
    raw = {
        "results": [
            {"index": 0, "reason": "missing field"},
            {"index": 1, "person_visible": "not a bool", "reason": "typed wrong"},
        ]
    }
    # Any entry missing `person_visible` (or wrong type) leaves the default True.
    assert parse_filter_response(raw, 2) == [True, True]


async def test_filter_empty_batch_returns_empty() -> None:
    got = await filter_images_for_persons(Settings(), images=[])
    assert got == []


async def test_filter_soft_fails_without_model_config() -> None:
    # No GEMINI_PERSON_FILTER_MODEL → all-True mask, no API call.
    settings = Settings(gemini_api_key="k", gemini_person_filter_model="")
    got = await filter_images_for_persons(
        settings,
        images=[(b"\x89PNG\r\n\x1a\n", "image/png")] * 3,
    )
    assert got == [True, True, True]


async def test_filter_soft_fails_without_api_key() -> None:
    settings = Settings(gemini_api_key="", gemini_person_filter_model="m")
    got = await filter_images_for_persons(
        settings, images=[(b"x", "image/jpeg")]
    )
    assert got == [True]


async def test_filter_rejects_batches_over_max() -> None:
    from mirror.integrations.gemini_person_filter import MAX_BATCH_SIZE

    settings = Settings(gemini_api_key="k", gemini_person_filter_model="m")
    oversized = [(b"x", "image/jpeg")] * (MAX_BATCH_SIZE + 1)
    with pytest.raises(Exception) as exc_info:
        await filter_images_for_persons(settings, oversized)
    assert "BATCH_TOO_LARGE" in str(exc_info.value) or exc_info.value.__class__.__name__.endswith(
        "Error"
    )

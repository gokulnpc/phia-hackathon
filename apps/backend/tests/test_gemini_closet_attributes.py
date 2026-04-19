"""Unit tests for Gemini attribute extractor normalization."""

from __future__ import annotations

import pytest

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_closet_attributes import (
    ATTRIBUTES_VERSION,
    extract_closet_attributes,
    normalize_attributes,
)


def test_normalize_clamps_bad_enums_to_safe_defaults() -> None:
    raw = {
        "style": "disco-chic",
        "color_family": "galactic",
        "pattern": "zigzag",
        "occasion_tags": ["time-travel"],
        "formality": 99,
        "season_tags": ["interdimensional"],
        "summary": "x" * 500,
    }
    out = normalize_attributes(raw)
    assert out["style"] == "casual"
    assert out["color_family"] == "neutral"
    assert out["pattern"] == "solid"
    assert out["occasion_tags"] == ["weekend"]  # fallback when all invalid
    assert out["formality"] == 5
    assert len(out["season_tags"]) == 4  # full fallback when all invalid
    assert len(out["summary"]) == 140


def test_normalize_keeps_valid_enums() -> None:
    raw = {
        "style": "formal",
        "color_family": "jewel",
        "pattern": "striped",
        "occasion_tags": ["work", "evening"],
        "formality": 4,
        "season_tags": ["fall", "winter"],
        "summary": "Short black wool coat",
    }
    out = normalize_attributes(raw)
    assert out["style"] == "formal"
    assert out["color_family"] == "jewel"
    assert out["pattern"] == "striped"
    assert out["occasion_tags"] == ["work", "evening"]
    assert out["formality"] == 4
    assert out["season_tags"] == ["fall", "winter"]
    assert out["summary"] == "Short black wool coat"


def test_normalize_clamps_formality_range() -> None:
    assert normalize_attributes({"formality": -5})["formality"] == 1
    assert normalize_attributes({"formality": 100})["formality"] == 5
    assert normalize_attributes({"formality": "3"})["formality"] == 3
    assert normalize_attributes({"formality": None})["formality"] == 3


def test_normalize_dedupes_occasion_tags() -> None:
    raw = {"occasion_tags": ["work", "work", "travel"]}
    out = normalize_attributes(raw)
    assert out["occasion_tags"] == ["work", "travel"]


def test_normalize_strips_case_on_enum_values() -> None:
    raw = {"style": "  Casual ", "color_family": "NEUTRAL"}
    out = normalize_attributes(raw)
    assert out["style"] == "casual"
    assert out["color_family"] == "neutral"


@pytest.mark.asyncio
async def test_extract_requires_image_bytes() -> None:
    settings = Settings(gemini_api_key="k", gemini_attributes_model="m")
    with pytest.raises(ValidationError):
        await extract_closet_attributes(settings, b"", "image/jpeg", {})


@pytest.mark.asyncio
async def test_extract_requires_config() -> None:
    settings = Settings(gemini_api_key="", gemini_attributes_model="m")
    with pytest.raises(ProviderError):
        await extract_closet_attributes(settings, b"x", "image/jpeg", {})


def test_attributes_version_is_positive_int() -> None:
    assert isinstance(ATTRIBUTES_VERSION, int)
    assert ATTRIBUTES_VERSION >= 1

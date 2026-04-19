"""Unit tests for Gemini fit-score response normalization (no live API calls)."""

from __future__ import annotations

import pytest

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_fit_score import (
    PROMPT_VERSION,
    normalize_fit_score_response,
    score_wardrobe_fit,
)

VALID_IDS = {"a", "b", "c"}


def test_normalize_clamps_scores_to_range() -> None:
    raw = {
        "overall_score": 150,
        "breakdown": {
            "silhouette": -10,
            "color_palette": 200,
            "closet_overlap": 50,
            "occasion_fit": 75,
            "brand_affinity": "80",
        },
        "matching_items": [],
        "conflicts": [],
        "explanation": "Looks great.",
        "confidence": "medium",
    }
    out = normalize_fit_score_response(raw, VALID_IDS)
    assert out["overall_score"] == 100
    assert out["breakdown"]["silhouette"] == 0
    assert out["breakdown"]["color_palette"] == 100
    assert out["breakdown"]["closet_overlap"] == 50
    assert out["breakdown"]["occasion_fit"] == 75
    assert out["breakdown"]["brand_affinity"] == 80


def test_normalize_drops_unknown_closet_item_ids() -> None:
    raw = {
        "overall_score": 80,
        "breakdown": {
            "silhouette": 80,
            "color_palette": 80,
            "closet_overlap": 80,
            "occasion_fit": 80,
            "brand_affinity": 80,
        },
        "matching_items": [
            {"closet_item_id": "a", "reason": "matches"},
            {"closet_item_id": "ghost", "reason": "not in closet"},
            {"closet_item_id": "b", "reason": "pairs nicely"},
        ],
        "conflicts": [{"closet_item_id": "nope", "reason": "???"}],
        "explanation": "ok",
        "confidence": "high",
    }
    out = normalize_fit_score_response(raw, VALID_IDS)
    assert [m["closet_item_id"] for m in out["matching_items"]] == ["a", "b"]
    assert out["conflicts"] == []


def test_normalize_deduplicates_matching_items() -> None:
    raw = {
        "overall_score": 80,
        "breakdown": {
            "silhouette": 80,
            "color_palette": 80,
            "closet_overlap": 80,
            "occasion_fit": 80,
            "brand_affinity": 80,
        },
        "matching_items": [
            {"closet_item_id": "a", "reason": "first"},
            {"closet_item_id": "a", "reason": "duplicate"},
        ],
        "conflicts": [],
        "explanation": "x",
        "confidence": "medium",
    }
    out = normalize_fit_score_response(raw, VALID_IDS)
    assert len(out["matching_items"]) == 1
    assert out["matching_items"][0]["closet_item_id"] == "a"
    assert out["matching_items"][0]["reason"] == "first"


def test_normalize_clamps_confidence_and_truncates_explanation() -> None:
    raw = {
        "overall_score": 50,
        "breakdown": {
            "silhouette": 50,
            "color_palette": 50,
            "closet_overlap": 50,
            "occasion_fit": 50,
            "brand_affinity": 50,
        },
        "matching_items": [],
        "conflicts": [],
        "explanation": "X" * 400,
        "confidence": "galaxy brain",
    }
    out = normalize_fit_score_response(raw, VALID_IDS)
    assert out["confidence"] == "medium"
    assert len(out["explanation"]) == 180


def test_normalize_caps_matching_items_at_3() -> None:
    raw = {
        "overall_score": 80,
        "breakdown": {
            "silhouette": 80,
            "color_palette": 80,
            "closet_overlap": 80,
            "occasion_fit": 80,
            "brand_affinity": 80,
        },
        "matching_items": [
            {"closet_item_id": cid, "reason": "ok"}
            for cid in ("a", "b", "c", "a", "b", "c")
        ],
        "conflicts": [],
        "explanation": "ok",
        "confidence": "medium",
    }
    out = normalize_fit_score_response(raw, VALID_IDS)
    assert len(out["matching_items"]) == 3


@pytest.mark.asyncio
async def test_score_wardrobe_fit_rejects_empty_closet() -> None:
    settings = Settings(gemini_api_key="k", gemini_fit_score_model="m")
    with pytest.raises(ValidationError) as ei:
        await score_wardrobe_fit(settings, None, "image/jpeg", {}, [])
    assert ei.value.code == "VALIDATION_FIT_SCORE_EMPTY_CLOSET"


@pytest.mark.asyncio
async def test_score_wardrobe_fit_rejects_missing_api_key() -> None:
    settings = Settings(gemini_api_key="", gemini_fit_score_model="m")
    with pytest.raises(ProviderError) as ei:
        await score_wardrobe_fit(
            settings, None, "image/jpeg", {}, [{"closet_item_id": "a"}]
        )
    assert ei.value.code == "GEMINI_NOT_CONFIGURED"


def test_prompt_version_is_positive_int() -> None:
    # Defensive: cache-key must stay a sane integer.
    assert isinstance(PROMPT_VERSION, int)
    assert PROMPT_VERSION >= 1

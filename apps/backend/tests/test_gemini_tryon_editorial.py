"""Unit tests for try-on editorial prompt helpers (no live Gemini calls)."""

import pytest

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_tryon_editorial import (
    build_tryon_editorial_instruction,
    enhance_tryon_editorial_png,
    pose_line_for_variant,
    resolve_tryon_editorial_model,
    scene_and_lighting_for_category,
    variant_index_from_job_id,
)


def test_scene_and_lighting_for_category_known_keys() -> None:
    tops = scene_and_lighting_for_category("tops").lower()
    assert "editorial" in tops
    assert "urban" in tops or "sidewalk" in tops
    assert "urban" in scene_and_lighting_for_category("bottoms").lower()
    assert "mediterranean" in scene_and_lighting_for_category("one-pieces").lower()


def test_scene_and_lighting_unknown_falls_back_to_auto() -> None:
    auto = scene_and_lighting_for_category("auto")
    assert "warm" in auto.lower()
    assert scene_and_lighting_for_category("unknown-sku") == auto


def test_pose_line_for_variant_cycles() -> None:
    assert pose_line_for_variant(0) != pose_line_for_variant(1)
    assert pose_line_for_variant(100) == pose_line_for_variant(100 % 4)


def test_build_instruction_contains_goal_constraints_and_scene() -> None:
    text = build_tryon_editorial_instruction(category_key="tops", variant_index=0)
    assert "HARD CONSTRAINTS" in text
    assert "EDITORIAL GOAL" in text
    assert "garment" in text.lower()
    assert "magazine" in text.lower()
    assert "similar to the input" not in text.lower()
    assert "full-frame composition similar" not in text.lower()


def test_variant_index_from_job_id_stable() -> None:
    jid = "550e8400-e29b-41d4-a716-446655440000"
    assert variant_index_from_job_id(jid) == variant_index_from_job_id(jid)
    assert 0 <= variant_index_from_job_id(jid) < 4


def test_resolve_tryon_editorial_model_prefers_explicit() -> None:
    s = Settings(
        gemini_tryon_editorial_model="editorial-model",
        gemini_avatar_model="avatar-model",
    )
    assert resolve_tryon_editorial_model(s) == "editorial-model"


def test_resolve_tryon_editorial_model_falls_back_to_avatar() -> None:
    s = Settings(gemini_tryon_editorial_model="", gemini_avatar_model="avatar-model")
    assert resolve_tryon_editorial_model(s) == "avatar-model"


@pytest.mark.asyncio
async def test_enhance_tryon_editorial_png_rejects_empty() -> None:
    s = Settings(gemini_api_key="k", gemini_avatar_model="m")
    with pytest.raises(ValidationError):
        await enhance_tryon_editorial_png(
            s,
            b"",
            garment_category_key="tops",
            variant_index=0,
        )


@pytest.mark.asyncio
async def test_enhance_tryon_editorial_png_requires_api_key() -> None:
    s = Settings(gemini_api_key="", gemini_avatar_model="m")
    with pytest.raises(ProviderError) as ei:
        await enhance_tryon_editorial_png(
            s,
            b"\x89PNG\r\n\x1a\n",
            garment_category_key="tops",
            variant_index=0,
        )
    assert ei.value.code == "GEMINI_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_enhance_tryon_editorial_png_requires_model() -> None:
    s = Settings(gemini_api_key="k", gemini_tryon_editorial_model="", gemini_avatar_model="")
    with pytest.raises(ProviderError) as ei:
        await enhance_tryon_editorial_png(
            s,
            b"\x89PNG\r\n\x1a\n",
            garment_category_key="tops",
            variant_index=0,
        )
    assert ei.value.code == "GEMINI_NOT_CONFIGURED"

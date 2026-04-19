"""Unit tests for Gemini avatar response parsing (no live API calls)."""

from types import SimpleNamespace

import pytest

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_avatar import (
    extract_first_image_bytes_from_generate_response,
    generate_avatar_png,
)


def test_extract_first_image_bytes_from_response() -> None:
    inline = SimpleNamespace(data=b"\x89PNG\r\n\x1a\n", mime_type="image/png")
    part = SimpleNamespace(inline_data=inline)
    content = SimpleNamespace(parts=[part])
    cand = SimpleNamespace(content=content)
    resp = SimpleNamespace(candidates=[cand])
    assert extract_first_image_bytes_from_generate_response(resp) == b"\x89PNG\r\n\x1a\n"


def test_extract_raises_when_no_image() -> None:
    resp = SimpleNamespace(candidates=[])
    with pytest.raises(ProviderError) as ei:
        extract_first_image_bytes_from_generate_response(resp)
    assert ei.value.code == "GEMINI_NO_IMAGE"


@pytest.mark.asyncio
async def test_generate_avatar_png_validates_count() -> None:
    s = Settings(gemini_api_key="k", gemini_avatar_model="m")
    with pytest.raises(ValidationError):
        await generate_avatar_png(s, [])

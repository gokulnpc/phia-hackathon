"""Gemini image generation: reference photo(s) → neutral-background full-body avatar PNG."""

from __future__ import annotations

import asyncio
from io import BytesIO
from typing import Any

from google import genai
from google.genai import types
from PIL import Image

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError


def _guess_mime(image_bytes: bytes) -> str:
    try:
        with Image.open(BytesIO(image_bytes)) as im:
            fmt = (im.format or "JPEG").upper()
    except OSError:
        return "image/jpeg"
    mapping = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}
    return mapping.get(fmt, "image/jpeg")


def _role_label(index: int, total: int) -> str:
    if total == 1:
        return "PRIMARY_FULL_BODY_REFERENCE"
    labels = ("FRONT_FULL_BODY", "THREE_QUARTER_OR_SIDE", "BACK_OR_EXTRA", "EXTRA_4", "EXTRA_5")
    return labels[min(index, len(labels) - 1)]


_AVATAR_INSTRUCTION = (
    "Using the reference image(s) above, generate one photorealistic full-body photograph of the "
    "same person. Neutral solid light-gray studio background, soft even lighting, subject facing "
    "the camera, feet visible, arms relaxed at sides. Preserve identity, body proportions, skin "
    "tone, and hairstyle. Clothing: keep outer garments consistent with the references when clear; "
    "otherwise use simple fitted neutral underlayers. No text, watermark, logo, collage, or "
    "multiple people. Return only the generated image."
)


def _build_user_parts(image_bytes_list: list[bytes]) -> list[types.Part]:
    parts: list[types.Part] = []
    n = len(image_bytes_list)
    for i, raw in enumerate(image_bytes_list):
        role = _role_label(i, n)
        parts.append(
            types.Part(
                text=(
                    f"Image {i + 1} of {n} — role `{role}`. "
                    f"This is input for virtual try-on preprocessing only."
                )
            )
        )
        parts.append(
            types.Part(
                inline_data=types.Blob(
                    mime_type=_guess_mime(raw),
                    data=raw,
                )
            )
        )
    parts.append(types.Part(text=_AVATAR_INSTRUCTION))
    return parts


def extract_first_image_bytes_from_generate_response(response: Any) -> bytes:
    """Return raw image bytes from the first image part in a generate_content response."""
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) if content is not None else None
        if not parts:
            continue
        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline is None:
                continue
            data = getattr(inline, "data", None)
            if data:
                return bytes(data)
    raise ProviderError(
        "GEMINI_NO_IMAGE",
        "Gemini returned no inline image in the response",
    )


def _normalize_to_png(image_bytes: bytes) -> bytes:
    with Image.open(BytesIO(image_bytes)) as im:
        buf = BytesIO()
        im.convert("RGB").save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def _generate_avatar_png_sync(api_key: str, model: str, image_bytes_list: list[bytes]) -> bytes:
    client = genai.Client(api_key=api_key)
    parts = _build_user_parts(image_bytes_list)
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_modalities=[types.Modality.IMAGE],
            temperature=0.35,
        ),
    )
    raw = extract_first_image_bytes_from_generate_response(response)
    return _normalize_to_png(raw)


async def generate_avatar_png(settings: Settings, image_bytes_list: list[bytes]) -> bytes:
    """Gemini: 1–5 reference images in → single normalized PNG bytes out."""
    n = len(image_bytes_list)
    if n < 1 or n > 5:
        raise ValidationError(
            "VALIDATION_AVATAR_IMAGE_COUNT",
            "Between 1 and 5 reference images are required.",
        )
    if not settings.gemini_api_key.strip():
        raise ProviderError("GEMINI_NOT_CONFIGURED", "GEMINI_API_KEY is not set.")
    if not settings.gemini_avatar_model.strip():
        raise ProviderError("GEMINI_NOT_CONFIGURED", "GEMINI_AVATAR_MODEL is not set.")
    return await asyncio.to_thread(
        _generate_avatar_png_sync,
        settings.gemini_api_key.strip(),
        settings.gemini_avatar_model.strip(),
        image_bytes_list,
    )

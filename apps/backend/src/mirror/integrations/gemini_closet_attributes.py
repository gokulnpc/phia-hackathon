"""Gemini Vision: closet item (image + text) → structured fashion attributes JSON.

Mirrors the Smart Stylist codelab pattern of extracting a textual description /
attribute bundle at save time, so downstream scoring can consume text instead of
re-signing image URLs on every call.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from google import genai
from google.genai import types

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError

# Bump when the schema below or the instruction changes; downstream cache keys
# include this version so stale attributes invalidate naturally.
ATTRIBUTES_VERSION = 1

_ALLOWED_STYLE = {"casual", "smart_casual", "formal", "athletic", "loungewear"}
_ALLOWED_COLOR_FAMILY = {
    "neutral",
    "warm",
    "cool",
    "earth",
    "jewel",
    "pastel",
    "bold",
}
_ALLOWED_PATTERN = {"solid", "striped", "floral", "graphic", "plaid", "other"}
_ALLOWED_OCCASION = {"work", "weekend", "evening", "athletic", "travel", "formal"}
_ALLOWED_SEASON = {"spring", "summer", "fall", "winter"}

_ATTRIBUTES_INSTRUCTION = (
    "You are a concise fashion cataloguer. Given a single product image (and "
    "optional text hints), return ONLY a JSON object matching the response "
    "schema. Be specific, grounded in what is visible, and avoid speculation. "
    "Rules:\n"
    "- `style`: one of casual, smart_casual, formal, athletic, loungewear.\n"
    "- `color_family`: dominant color family (neutral/warm/cool/earth/jewel/pastel/bold).\n"
    "- `pattern`: solid|striped|floral|graphic|plaid|other.\n"
    "- `occasion_tags`: 1–3 from [work, weekend, evening, athletic, travel, formal].\n"
    "- `formality`: integer 1 (very casual) to 5 (black-tie).\n"
    "- `season_tags`: 1–4 from [spring, summer, fall, winter].\n"
    "- `summary`: at most 140 characters, plain text, no markdown.\n"
)


# Gemini structured-output schema. google.genai accepts a dict or a typed schema;
# we use types.Schema so invalid values fail fast at client side.
def _response_schema() -> types.Schema:
    return types.Schema(
        type=types.Type.OBJECT,
        required=[
            "style",
            "color_family",
            "pattern",
            "occasion_tags",
            "formality",
            "season_tags",
            "summary",
        ],
        properties={
            "style": types.Schema(type=types.Type.STRING),
            "color_family": types.Schema(type=types.Type.STRING),
            "pattern": types.Schema(type=types.Type.STRING),
            "occasion_tags": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(type=types.Type.STRING),
            ),
            "formality": types.Schema(type=types.Type.INTEGER),
            "season_tags": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(type=types.Type.STRING),
            ),
            "summary": types.Schema(type=types.Type.STRING),
        },
    )


def _hints_text(hints: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("name", "brand", "category", "color"):
        val = hints.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(f"{key}: {val.strip()}")
    return "\n".join(parts) if parts else "(no additional hints)"


def _build_user_parts(
    image_bytes: bytes, mime_type: str, hints: dict[str, Any]
) -> list[types.Part]:
    return [
        types.Part(
            inline_data=types.Blob(mime_type=mime_type, data=image_bytes),
        ),
        types.Part(text=f"Hints:\n{_hints_text(hints)}"),
        types.Part(text=_ATTRIBUTES_INSTRUCTION),
    ]


def _extract_json_text(response: Any) -> str:
    """Gemini returns JSON text in the first candidate's parts. Raise if missing."""
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) if content is not None else None
        if not parts:
            continue
        for part in parts:
            t = getattr(part, "text", None)
            if isinstance(t, str) and t.strip():
                return t.strip()
    raise ProviderError(
        "GEMINI_NO_TEXT",
        "Gemini attributes response had no text content",
    )


def _clamp_to_set(value: Any, allowed: set[str], fallback: str) -> str:
    if isinstance(value, str) and value.strip().lower() in allowed:
        return value.strip().lower()
    return fallback


def _clamp_tags(values: Any, allowed: set[str], max_len: int) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for v in values:
        if not isinstance(v, str):
            continue
        key = v.strip().lower()
        if key in allowed and key not in out:
            out.append(key)
        if len(out) >= max_len:
            break
    return out


def normalize_attributes(raw: dict[str, Any]) -> dict[str, Any]:
    """Clamp Gemini output to the allowed enum values; defensive for mypy/strict schema."""
    formality_raw = raw.get("formality")
    if isinstance(formality_raw, int):
        formality = formality_raw
    elif isinstance(formality_raw, float):
        formality = int(formality_raw)
    elif isinstance(formality_raw, str):
        try:
            formality = int(float(formality_raw))
        except ValueError:
            formality = 3
    else:
        formality = 3
    formality = max(1, min(5, formality))

    summary = raw.get("summary")
    if not isinstance(summary, str):
        summary = ""
    summary = summary.strip()[:140]

    return {
        "style": _clamp_to_set(raw.get("style"), _ALLOWED_STYLE, "casual"),
        "color_family": _clamp_to_set(
            raw.get("color_family"), _ALLOWED_COLOR_FAMILY, "neutral"
        ),
        "pattern": _clamp_to_set(raw.get("pattern"), _ALLOWED_PATTERN, "solid"),
        "occasion_tags": _clamp_tags(raw.get("occasion_tags"), _ALLOWED_OCCASION, 3)
        or ["weekend"],
        "formality": formality,
        "season_tags": _clamp_tags(raw.get("season_tags"), _ALLOWED_SEASON, 4)
        or ["spring", "summer", "fall", "winter"],
        "summary": summary or "Wardrobe item",
    }


def _extract_sync(
    api_key: str,
    model: str,
    image_bytes: bytes,
    mime_type: str,
    hints: dict[str, Any],
) -> dict[str, Any]:
    client = genai.Client(api_key=api_key)
    parts = _build_user_parts(image_bytes, mime_type, hints)
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_response_schema(),
            temperature=0.2,
        ),
    )
    text = _extract_json_text(response)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProviderError(
            "GEMINI_BAD_JSON",
            f"Gemini attributes returned non-JSON: {exc}",
        ) from exc
    if not isinstance(parsed, dict):
        raise ProviderError("GEMINI_BAD_JSON", "Gemini attributes response was not a JSON object")
    return normalize_attributes(parsed)


async def extract_closet_attributes(
    settings: Settings,
    image_bytes: bytes,
    mime_type: str,
    hints: dict[str, Any],
) -> dict[str, Any]:
    """Closet item image + hints → normalized attributes dict."""
    if not image_bytes:
        raise ValidationError(
            "VALIDATION_ATTRIBUTES_IMAGE_EMPTY",
            "Image bytes required for attribute extraction.",
        )
    if not settings.gemini_api_key.strip():
        raise ProviderError("GEMINI_NOT_CONFIGURED", "GEMINI_API_KEY is not set.")
    if not settings.gemini_attributes_model.strip():
        raise ProviderError(
            "GEMINI_NOT_CONFIGURED", "GEMINI_ATTRIBUTES_MODEL is not set."
        )
    return await asyncio.to_thread(
        _extract_sync,
        settings.gemini_api_key.strip(),
        settings.gemini_attributes_model.strip(),
        image_bytes,
        mime_type or "image/jpeg",
        hints,
    )

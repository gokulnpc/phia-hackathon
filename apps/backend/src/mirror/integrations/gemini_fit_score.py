"""Gemini (text+vision) → wardrobe fit score JSON.

The candidate product's image goes in as the only image part. Owned closet items
are injected as structured-text attributes (produced earlier by the enrichment
worker), not as image URLs — cheaper and sidesteps the 5-min-signed-URL issue
from the try-on path.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from google import genai
from google.genai import types

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError

# Bump on any change to the prompt or response schema; used in the fit-score
# cache key so stale rationales naturally invalidate.
PROMPT_VERSION = 1


_ALLOWED_CONFIDENCE = {"low", "medium", "high"}


_FIT_SCORE_INSTRUCTION = (
    "You are evaluating how well a candidate retail product fits with the "
    "user's existing owned wardrobe. Return ONLY JSON matching the response "
    "schema.\n"
    "\n"
    "Scoring dimensions (0-100 each):\n"
    "  - silhouette: does the cut/shape/layering work with owned items "
    "the user already wears together?\n"
    "  - color_palette: does its color family complement the user's "
    "existing palette?\n"
    "  - closet_overlap: how much of the owned closet this candidate "
    "meaningfully pairs with.\n"
    "  - occasion_fit: do the occasion tags overlap with what the user "
    "already owns?\n"
    "  - brand_affinity: brand familiarity with existing owned pieces "
    "(tier/aesthetic, not logo).\n"
    "\n"
    "Also return:\n"
    "  - overall_score (0-100): holistic wardrobe-fit, not the average of "
    "the five dimensions.\n"
    "  - matching_items: up to 3 owned items (by closet_item_id) that this "
    "product pairs best with. Each entry: "
    "{closet_item_id, reason} where reason <= 80 chars.\n"
    "  - conflicts: up to 2 owned items that this product clashes with, "
    "same shape as matching_items.\n"
    "  - explanation: <= 180 chars, plain text, no markdown, explaining "
    "the overall score.\n"
    "  - confidence: low|medium|high based on closet size and signal "
    "strength. Use 'low' when fewer than 3 owned items are provided.\n"
    "\n"
    "Be honest about bad news: if the candidate doesn't match, say so "
    "clearly. Do not invent closet_item_ids - only use the ids from the "
    "provided list.\n"
)


def _response_schema() -> types.Schema:
    score_schema = types.Schema(type=types.Type.INTEGER)
    return types.Schema(
        type=types.Type.OBJECT,
        required=[
            "overall_score",
            "breakdown",
            "matching_items",
            "conflicts",
            "explanation",
            "confidence",
        ],
        properties={
            "overall_score": score_schema,
            "breakdown": types.Schema(
                type=types.Type.OBJECT,
                required=[
                    "silhouette",
                    "color_palette",
                    "closet_overlap",
                    "occasion_fit",
                    "brand_affinity",
                ],
                properties={
                    "silhouette": score_schema,
                    "color_palette": score_schema,
                    "closet_overlap": score_schema,
                    "occasion_fit": score_schema,
                    "brand_affinity": score_schema,
                },
            ),
            "matching_items": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(
                    type=types.Type.OBJECT,
                    required=["closet_item_id", "reason"],
                    properties={
                        "closet_item_id": types.Schema(type=types.Type.STRING),
                        "reason": types.Schema(type=types.Type.STRING),
                    },
                ),
            ),
            "conflicts": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(
                    type=types.Type.OBJECT,
                    required=["closet_item_id", "reason"],
                    properties={
                        "closet_item_id": types.Schema(type=types.Type.STRING),
                        "reason": types.Schema(type=types.Type.STRING),
                    },
                ),
            ),
            "explanation": types.Schema(type=types.Type.STRING),
            "confidence": types.Schema(type=types.Type.STRING),
        },
    )


def _format_owned_items(owned_items: list[dict[str, Any]]) -> str:
    """One line per owned item: ordered, numbered, stable."""
    lines: list[str] = []
    for item in owned_items:
        attrs = item.get("attributes") or {}
        parts = [
            f"id={item['closet_item_id']}",
            f"name={item.get('name', '(unnamed)')}",
            f"brand={item.get('brand') or '(unbranded)'}",
            f"category={item.get('category') or '(uncat)'}",
        ]
        if isinstance(attrs, dict) and attrs:
            parts.extend(
                [
                    f"style={attrs.get('style', '?')}",
                    f"color_family={attrs.get('color_family', '?')}",
                    f"pattern={attrs.get('pattern', '?')}",
                    f"formality={attrs.get('formality', '?')}",
                    f"occasions={','.join(attrs.get('occasion_tags') or [])}",
                    f"summary={attrs.get('summary', '')}",
                ]
            )
        else:
            parts.append("attributes=unenriched")
        lines.append("  - " + " | ".join(parts))
    return "\n".join(lines)


def _format_candidate(candidate: dict[str, Any]) -> str:
    price = candidate.get("price_usd")
    price_str = str(price) if price is not None else "?"
    return (
        f"name: {candidate.get('name', '')}\n"
        f"brand: {candidate.get('brand') or '(unbranded)'}\n"
        f"category: {candidate.get('category') or '(uncategorized)'}\n"
        f"price_usd: {price_str}\n"
        f"color: {candidate.get('color') or '(unknown)'}\n"
    )


def _build_user_parts(
    candidate_image_bytes: bytes | None,
    candidate_mime: str,
    candidate: dict[str, Any],
    owned_items: list[dict[str, Any]],
) -> list[types.Part]:
    parts: list[types.Part] = []
    if candidate_image_bytes:
        parts.append(
            types.Part(
                inline_data=types.Blob(mime_type=candidate_mime, data=candidate_image_bytes)
            )
        )
    parts.append(types.Part(text=f"CANDIDATE PRODUCT\n{_format_candidate(candidate)}"))
    parts.append(
        types.Part(
            text=(
                f"OWNED WARDROBE ({len(owned_items)} items — only reference these ids)\n"
                f"{_format_owned_items(owned_items)}"
            )
        )
    )
    parts.append(types.Part(text=_FIT_SCORE_INSTRUCTION))
    return parts


def _extract_json_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        cparts = getattr(content, "parts", None) if content is not None else None
        if not cparts:
            continue
        for part in cparts:
            t = getattr(part, "text", None)
            if isinstance(t, str) and t.strip():
                return t.strip()
    raise ProviderError("GEMINI_NO_TEXT", "Gemini fit-score response had no text content")


def _clamp_score(value: Any) -> int:
    if isinstance(value, bool):  # bool is int subclass — reject
        return 50
    if isinstance(value, int):
        return max(0, min(100, value))
    if isinstance(value, float):
        return max(0, min(100, int(value)))
    if isinstance(value, str):
        try:
            return max(0, min(100, int(float(value))))
        except ValueError:
            return 50
    return 50


def _clamp_items(
    raw: Any, valid_ids: set[str], max_len: int
) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        cid = entry.get("closet_item_id")
        reason = entry.get("reason")
        if not isinstance(cid, str) or cid not in valid_ids or cid in seen:
            continue
        if not isinstance(reason, str):
            reason = ""
        out.append({"closet_item_id": cid, "reason": reason.strip()[:80]})
        seen.add(cid)
        if len(out) >= max_len:
            break
    return out


def normalize_fit_score_response(
    raw: dict[str, Any], valid_closet_ids: set[str]
) -> dict[str, Any]:
    breakdown_raw = raw.get("breakdown") or {}
    if not isinstance(breakdown_raw, dict):
        breakdown_raw = {}
    breakdown = {
        "silhouette": _clamp_score(breakdown_raw.get("silhouette")),
        "color_palette": _clamp_score(breakdown_raw.get("color_palette")),
        "closet_overlap": _clamp_score(breakdown_raw.get("closet_overlap")),
        "occasion_fit": _clamp_score(breakdown_raw.get("occasion_fit")),
        "brand_affinity": _clamp_score(breakdown_raw.get("brand_affinity")),
    }
    confidence_raw = raw.get("confidence")
    confidence = (
        confidence_raw.strip().lower()
        if isinstance(confidence_raw, str) and confidence_raw.strip().lower() in _ALLOWED_CONFIDENCE
        else "medium"
    )
    explanation_raw = raw.get("explanation")
    explanation = (
        explanation_raw.strip()[:180]
        if isinstance(explanation_raw, str) and explanation_raw.strip()
        else "Scored against your owned closet."
    )
    return {
        "overall_score": _clamp_score(raw.get("overall_score")),
        "breakdown": breakdown,
        "matching_items": _clamp_items(raw.get("matching_items"), valid_closet_ids, 3),
        "conflicts": _clamp_items(raw.get("conflicts"), valid_closet_ids, 2),
        "explanation": explanation,
        "confidence": confidence,
    }


def _score_sync(
    api_key: str,
    model: str,
    candidate_image_bytes: bytes | None,
    candidate_mime: str,
    candidate: dict[str, Any],
    owned_items: list[dict[str, Any]],
    valid_closet_ids: set[str],
) -> dict[str, Any]:
    client = genai.Client(api_key=api_key)
    parts = _build_user_parts(candidate_image_bytes, candidate_mime, candidate, owned_items)
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_response_schema(),
            temperature=0.25,
        ),
    )
    text = _extract_json_text(response)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProviderError(
            "GEMINI_BAD_JSON", f"Gemini fit-score returned non-JSON: {exc}"
        ) from exc
    if not isinstance(parsed, dict):
        raise ProviderError("GEMINI_BAD_JSON", "Gemini fit-score response was not a JSON object")
    return normalize_fit_score_response(parsed, valid_closet_ids)


async def score_wardrobe_fit(
    settings: Settings,
    candidate_image_bytes: bytes | None,
    candidate_mime: str,
    candidate: dict[str, Any],
    owned_items: list[dict[str, Any]],
) -> dict[str, Any]:
    """Candidate product + owned-items snapshot → normalized fit-score dict."""
    if not owned_items:
        raise ValidationError(
            "VALIDATION_FIT_SCORE_EMPTY_CLOSET",
            "Owned-items list cannot be empty for Gemini scoring.",
        )
    if not settings.gemini_api_key.strip():
        raise ProviderError("GEMINI_NOT_CONFIGURED", "GEMINI_API_KEY is not set.")
    if not settings.gemini_fit_score_model.strip():
        raise ProviderError(
            "GEMINI_NOT_CONFIGURED", "GEMINI_FIT_SCORE_MODEL is not set."
        )
    valid_ids = {str(item["closet_item_id"]) for item in owned_items}
    return await asyncio.to_thread(
        _score_sync,
        settings.gemini_api_key.strip(),
        settings.gemini_fit_score_model.strip(),
        candidate_image_bytes,
        candidate_mime or "image/jpeg",
        candidate,
        owned_items,
        valid_ids,
    )

"""Gemini batch person-detection filter for reverse-search web results.

For N downloaded candidate images (typically 10–20), returns a parallel list of
booleans: "does this image show a person wearing clothing?" Used to drop
flatlays, logos, pack shots, and fabric close-ups before we render the
"Around the web" grid.

Uses `gemini-2.5-flash` — a text+vision → JSON model — NOT `gemini-2.5-flash-image`
(that's image generation, the wrong tool here).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from google import genai
from google.genai import types

from mirror.core.config import Settings
from mirror.core.errors import ProviderError

# Bump whenever the filter prompt / schema changes so downstream cache layers
# can invalidate. Reverse-search currently uses the service-level PROMPT_VERSION
# from `visual_search.service` — this is informational only.
# Bump when the prompt/schema changes. The reverse-search service cache key
# uses `service.PROMPT_VERSION`, not this one; bump that in tandem to
# invalidate cached results on prompt tightening.
PROMPT_VERSION = 2

MAX_BATCH_SIZE = 20

_INSTRUCTION = (
    "You are a STRICT quality filter for 'Worn by' reverse-image-search "
    "results. The product surface promises 'real people wearing this item "
    "in the wild'. Studio product shots, mannequins, and retailer category "
    "page images all violate that promise. Reject aggressively.\n"
    "\n"
    "Return ONLY JSON matching the schema. For each index 0..N-1 return one "
    "entry with:\n"
    "  - index: the integer index of the image\n"
    "  - person_visible: boolean (see KEEP/REJECT rules below)\n"
    "  - reason: <= 40 chars, plain text, explaining your decision\n"
    "\n"
    "REJECT (person_visible=false) if ANY of the following is true:\n"
    "  - mannequin, dress form, ghost-mannequin, or headless torso display\n"
    "  - laydown / flatlay / folded garment on a surface\n"
    "  - solid white or plain studio background typical of e-commerce PDPs\n"
    "  - garment on a hanger, rack, shelf, or being held up by hand\n"
    "  - close-up detail shot, fabric swatch, logo, or tag\n"
    "  - multi-panel grid / collage of product stills\n"
    "  - NO visible human skin anywhere in the frame (arms, legs, neck, "
    "    face, or hands interacting with the body)\n"
    "\n"
    "KEEP (person_visible=true) ONLY if BOTH:\n"
    "  - a real human body is clearly visible (torso with arms, full-body, "
    "    mirror-selfie, street-style, or candid shot)\n"
    "  - the clothing is actually on that body, not just adjacent\n"
    "\n"
    "Edge cases:\n"
    "  - Partial body (e.g. torso-crop mirror selfie) with visible skin → KEEP\n"
    "  - Polished editorial shot on a real model in a real location → KEEP\n"
    "  - Polished editorial shot on a real model against plain white backdrop\n"
    "    → REJECT (can't distinguish from PDP)\n"
    "\n"
    "When in doubt, REJECT. False negatives are cheap (user loses one "
    "candidate); false positives are expensive (user sees mannequins)."
)


def _response_schema(n: int) -> types.Schema:
    item_schema = types.Schema(
        type=types.Type.OBJECT,
        required=["index", "person_visible", "reason"],
        properties={
            "index": types.Schema(type=types.Type.INTEGER),
            "person_visible": types.Schema(type=types.Type.BOOLEAN),
            "reason": types.Schema(type=types.Type.STRING),
        },
    )
    return types.Schema(
        type=types.Type.OBJECT,
        required=["results"],
        properties={
            "results": types.Schema(
                type=types.Type.ARRAY,
                min_items=n,
                max_items=n,
                items=item_schema,
            ),
        },
    )


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
    raise ProviderError(
        "GEMINI_NO_TEXT", "Gemini person-filter response had no text content"
    )


def parse_filter_response(raw: dict[str, Any], n: int) -> list[bool]:
    """Normalize a Gemini response into an N-length keep-mask.

    Missing, extra, or malformed indices default to `True` (keep) — we bias
    toward showing the result rather than hiding it on filter uncertainty.
    """
    results_raw = raw.get("results")
    if not isinstance(results_raw, list):
        return [True] * n

    mask = [True] * n
    for entry in results_raw:
        if not isinstance(entry, dict):
            continue
        idx = entry.get("index")
        if not isinstance(idx, int) or idx < 0 or idx >= n:
            continue
        visible = entry.get("person_visible")
        if isinstance(visible, bool):
            mask[idx] = visible
    return mask


# 512 px longest-edge is plenty for "is there a person wearing clothing"
# and cuts Gemini token cost ~3-5× vs retailer-resolution hero images.
_FILTER_MAX_EDGE = 512


def _resize_for_filter(image_bytes: bytes) -> tuple[bytes, str]:
    """Resize to max edge 512 px and re-encode as JPEG, preserving aspect ratio.

    Returns (bytes, mime). Fails open: if Pillow can't decode (rare), returns
    the original bytes + a JPEG fallback mime — the filter will still run,
    just more expensively.
    """
    from io import BytesIO

    from PIL import Image

    try:
        with Image.open(BytesIO(image_bytes)) as img:
            img.load()
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            elif img.mode == "RGBA":
                # Flatten transparency onto white so JPEG (which has no alpha)
                # doesn't render transparent areas as black.
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1])
                img = bg
            w, h = img.size
            longest = max(w, h)
            if longest > _FILTER_MAX_EDGE:
                ratio = _FILTER_MAX_EDGE / float(longest)
                img = img.resize(
                    (max(1, int(round(w * ratio))), max(1, int(round(h * ratio)))),
                    Image.Resampling.LANCZOS,
                )
            out = BytesIO()
            img.save(out, format="JPEG", quality=80, optimize=True)
            return out.getvalue(), "image/jpeg"
    except Exception:
        return image_bytes, "image/jpeg"


def _filter_sync(
    api_key: str,
    model: str,
    images: list[tuple[bytes, str]],
) -> list[bool]:
    n = len(images)
    client = genai.Client(api_key=api_key)
    parts: list[types.Part] = [types.Part(text=_INSTRUCTION)]
    for i, (image_bytes, mime) in enumerate(images):
        small_bytes, small_mime = _resize_for_filter(image_bytes)
        parts.append(types.Part(text=f"Image index {i}:"))
        parts.append(
            types.Part(
                inline_data=types.Blob(
                    mime_type=small_mime or mime or "image/jpeg",
                    data=small_bytes,
                )
            )
        )
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_response_schema(n),
            temperature=0.0,
        ),
    )
    text = _extract_json_text(response)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProviderError(
            "GEMINI_BAD_JSON",
            f"Gemini person-filter returned non-JSON: {exc}",
        ) from exc
    if not isinstance(parsed, dict):
        raise ProviderError(
            "GEMINI_BAD_JSON", "Gemini person-filter response was not a JSON object"
        )
    return parse_filter_response(parsed, n)


async def filter_images_for_persons(
    settings: Settings,
    images: list[tuple[bytes, str]],
) -> list[bool]:
    """Return an N-length keep-mask for a batch of (image_bytes, mime) pairs.

    Fails open: if the filter model isn't configured, returns an all-True
    mask so the calling path still yields results (soft-degrade).
    """
    if not images:
        return []
    api_key = settings.gemini_api_key.strip()
    model = settings.gemini_person_filter_model.strip()
    if not api_key or not model:
        # Soft-fail: let the worker log a warning and keep every candidate.
        # Hard-failing would punish the user for an unset env var.
        return [True] * len(images)
    if len(images) > MAX_BATCH_SIZE:
        raise ProviderError(
            "GEMINI_BATCH_TOO_LARGE",
            f"Batch of {len(images)} exceeds MAX_BATCH_SIZE={MAX_BATCH_SIZE}",
        )
    return await asyncio.to_thread(_filter_sync, api_key, model, images)

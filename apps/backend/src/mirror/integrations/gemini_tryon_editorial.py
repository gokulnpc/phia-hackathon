"""Post-FASHN try-on PNG → editorial-style polish via Gemini image (same modality as avatar)."""

from __future__ import annotations

import asyncio
import uuid
from io import BytesIO

from google import genai
from google.genai import types
from PIL import Image

from mirror.core.config import Settings
from mirror.core.errors import ProviderError, ValidationError
from mirror.integrations.gemini_avatar import extract_first_image_bytes_from_generate_response

# Slightly higher than conservative defaults so scene/pose vary between jobs; image models may
# treat this lightly, but prompts remain the primary lever for magazine-style diversity.
EDITORIAL_IMAGE_TEMPERATURE = 0.72

# FASHN worker category strings (see tryon_worker._fashn_category).
_SCENE_BY_CATEGORY: dict[str, str] = {
    "tops": (
        "Setting: on-location editorial — sunlit urban sidewalk, weathered plaster wall, or "
        "quiet residential street with shallow depth of field; background must read as a real "
        "place with texture and depth, not a seamless studio sweep. "
        "Lighting: golden-hour side light or soft late-day sun with gentle shadow falloff; "
        "rim light optional. Mood: premium lookbook / campaign location shoot."
    ),
    "bottoms": (
        "Setting: muted urban courtyard, stone steps, or crosswalk edge — environmental "
        "storytelling, not a blank backdrop. Shallow depth of field; background shapes soft "
        "but recognizable. "
        "Lighting: warm natural light with directional contrast (sun + reflected fill). "
        "Mood: effortless street editorial with motion-friendly energy."
    ),
    "one-pieces": (
        "Setting: Mediterranean-inspired open air — sun-bleached wall, coastal haze, or "
        "terracotta tones with sky or sea soft blur. "
        "Lighting: warm backlit rim or late sun; airy aspirational mood. "
        "Full-length framing friendly — dress or jumpsuit reads as hero."
    ),
    "auto": (
        "Setting: believable editorial location — interior with large-window daylight on "
        "textured plaster, or soft outdoor lane with foliage bokeh — never a flat gray void. "
        "Lighting: cinematic contrast (key + subtle fill), film-like warmth. "
        "Mood: magazine spread, not e-commerce packshot."
    ),
}

_POSE_VARIANTS: tuple[str, ...] = (
    "Pose: lean shoulders against a wall or architecture, weight on the back foot, gaze past "
    "the lens — relaxed editorial attitude.",
    "Pose: walking mid-step toward camera; natural arm swing; fabric suggests motion without "
    "motion blur smear.",
    "Pose: seated low on steps or a bench, torso angled, asymmetric composition — candid "
    "campaign energy.",
    "Pose: arms loosely folded or hands at pockets/waist; three-quarter body angle to camera; "
    "chin slightly lifted, confident catalog-meets-editorial stance.",
)


def scene_and_lighting_for_category(category_key: str) -> str:
    """Return scene/lighting brief for FASHN category string (tops, bottoms, one-pieces, auto)."""
    k = category_key.strip().lower() if category_key else "auto"
    return _SCENE_BY_CATEGORY.get(k, _SCENE_BY_CATEGORY["auto"])


def pose_line_for_variant(variant_index: int) -> str:
    """Deterministic pose line from variant index (e.g. hash(job_id) % len)."""
    if not _POSE_VARIANTS:
        return ""
    i = variant_index % len(_POSE_VARIANTS)
    return _POSE_VARIANTS[i]


def build_tryon_editorial_instruction(*, category_key: str, variant_index: int) -> str:
    """Full text instruction for Gemini image enhancement (unit-tested strings)."""
    scene = scene_and_lighting_for_category(category_key)
    pose = pose_line_for_variant(variant_index)
    constraints = (
        "HARD CONSTRAINTS — Preserve the same real person: face, hair, skin tone, and body "
        "proportions. Preserve the same garment exactly: cut, colors, pattern, fit, seams, "
        "and how it drapes on the body. Do not replace the outfit, change body shape, or add "
        "logos or readable text."
    )
    goal = (
        "EDITORIAL GOAL — Produce one photorealistic fashion magazine / campaign photograph "
        "(full-body or strong three-quarter). Place the subject in a believable on-location "
        "environment with depth and texture — not a flat neutral void. Use directional, "
        "cinematic lighting (natural sun, soft bounce, tasteful contrast). Apply warm, "
        "film-like color grading and rich fabric read. "
        "The stance must read as editorial: clearly different from a static catalog "
        "frontal pose — use natural posture, movement, or asymmetry per the pose line. "
        "You may adjust camera distance, angle, and crop for magazine composition; the same "
        "person and outfit must remain unmistakable."
    )
    parts = [goal, constraints, scene, pose]
    return "\n\n".join(parts)


def _guess_mime(image_bytes: bytes) -> str:
    try:
        with Image.open(BytesIO(image_bytes)) as im:
            fmt = (im.format or "JPEG").upper()
    except OSError:
        return "image/jpeg"
    mapping = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}
    return mapping.get(fmt, "image/jpeg")


def _normalize_to_png(image_bytes: bytes) -> bytes:
    with Image.open(BytesIO(image_bytes)) as im:
        buf = BytesIO()
        im.convert("RGB").save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def resolve_tryon_editorial_model(settings: Settings) -> str:
    """Model id for editorial pass; empty means skip or rely on avatar model in caller."""
    explicit = settings.gemini_tryon_editorial_model.strip()
    if explicit:
        return explicit
    return settings.gemini_avatar_model.strip()


def _enhance_tryon_editorial_png_sync(
    api_key: str,
    model: str,
    image_bytes: bytes,
    instruction_text: str,
) -> bytes:
    client = genai.Client(api_key=api_key)
    mime = _guess_mime(image_bytes)
    parts: list[types.Part] = [
        types.Part(
            text=(
                "Input image: virtual try-on render. Output exactly one photorealistic "
                "photograph suitable for a high-end fashion lookbook or magazine spread. "
                "Follow every instruction below."
            )
        ),
        types.Part(inline_data=types.Blob(mime_type=mime, data=image_bytes)),
        types.Part(text=instruction_text),
    ]
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=parts)],  # type: ignore[arg-type]
        config=types.GenerateContentConfig(
            response_modalities=[types.Modality.IMAGE],
            temperature=EDITORIAL_IMAGE_TEMPERATURE,
        ),
    )
    raw = extract_first_image_bytes_from_generate_response(response)
    return _normalize_to_png(raw)


async def enhance_tryon_editorial_png(
    settings: Settings,
    image_bytes: bytes,
    *,
    garment_category_key: str,
    variant_index: int,
) -> bytes:
    """
    FASHN output PNG in → editorial-polished PNG out.

    ``garment_category_key`` should match FASHN category: tops, bottoms, one-pieces, auto.
    ``variant_index`` selects pose phrasing (use hash(job_id) % N for variety).
    """
    if not image_bytes:
        raise ValidationError("VALIDATION_EMPTY_IMAGE", "Try-on image bytes are empty.")
    if not settings.gemini_api_key.strip():
        raise ProviderError("GEMINI_NOT_CONFIGURED", "GEMINI_API_KEY is not set.")
    model = resolve_tryon_editorial_model(settings)
    if not model:
        raise ProviderError(
            "GEMINI_NOT_CONFIGURED",
            "No Gemini image model: set GEMINI_TRYON_EDITORIAL_MODEL or GEMINI_AVATAR_MODEL.",
        )
    instruction = build_tryon_editorial_instruction(
        category_key=garment_category_key,
        variant_index=variant_index,
    )
    return await asyncio.to_thread(
        _enhance_tryon_editorial_png_sync,
        settings.gemini_api_key.strip(),
        model,
        image_bytes,
        instruction,
    )


def variant_index_from_job_id(job_id: str, *, modulo: int | None = None) -> int:
    """Stable non-negative variant index from job UUID string (same input → same pose variant)."""
    m = modulo if modulo is not None else len(_POSE_VARIANTS)
    if m <= 0:
        return 0
    try:
        return uuid.UUID(job_id).int % m
    except ValueError:
        return abs(hash(job_id)) % m

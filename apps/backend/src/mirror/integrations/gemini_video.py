"""Gemini Veo 3.1 → MP4 video generation from a still try-on image.

Demo-only today: the seeder script (`scripts/seed_demo_tryon_video.py`)
calls this synchronously, polls the long-running operation, and uploads
the resulting MP4 to Supabase Storage. A future worker can use the same
function from an async pipeline; the API surface is intentionally simple
(bytes in → bytes out).

Veo 3.1 Fast (`veo-3.1-fast-generate-preview`) is the default — cheapest
720p preview model with image-to-video support. Override via
`GEMINI_VIDEO_MODEL`.
"""

from __future__ import annotations

import time
from typing import Any

from google import genai
from google.genai import types

from mirror.core.config import Settings
from mirror.core.errors import ProviderError

DEFAULT_MODEL = "veo-3.1-fast-generate-preview"
# Veo p99 is ~6 minutes (per Google docs). Cap polling so the seeder
# doesn't hang forever on a stuck operation.
POLL_TIMEOUT_S = 600
POLL_INTERVAL_S = 10


def _resolve_model(settings: Settings) -> str:
    raw = getattr(settings, "gemini_video_model", "") or ""
    return raw.strip() or DEFAULT_MODEL


def generate_tryon_video(
    settings: Settings,
    *,
    image_bytes: bytes,
    image_mime: str,
    prompt: str,
) -> bytes:
    """Generate an 8s 720p video conditioned on `image_bytes` + `prompt`.

    Returns raw MP4 bytes. Blocks for the duration of the long-running
    operation (typically 30-180 s for Veo 3.1 Fast at 720p).
    """
    api_key = settings.gemini_api_key.strip()
    if not api_key:
        raise ProviderError("GEMINI_NOT_CONFIGURED", "GEMINI_API_KEY is not set.")
    if not image_bytes:
        raise ProviderError("VEO_BAD_INPUT", "Empty image_bytes for Veo seed.")

    model = _resolve_model(settings)
    client = genai.Client(api_key=api_key)

    # Veo's image-to-video flow: pass the seed image as a `types.Image`
    # via the dedicated `image` parameter. Default config gives us 8 s
    # at 720p with synced audio (Veo 3.1 always-on audio track).
    image = types.Image(image_bytes=image_bytes, mime_type=image_mime)

    try:
        operation = client.models.generate_videos(
            model=model,
            prompt=prompt,
            image=image,
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(
            "VEO_SUBMIT_FAILED", f"Veo generate_videos failed to submit: {exc}"
        ) from exc

    started = time.monotonic()
    while not operation.done:
        if time.monotonic() - started > POLL_TIMEOUT_S:
            raise ProviderError(
                "VEO_TIMEOUT",
                f"Veo operation did not complete within {POLL_TIMEOUT_S}s",
            )
        time.sleep(POLL_INTERVAL_S)
        try:
            operation = client.operations.get(operation)
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(
                "VEO_POLL_FAILED", f"Veo operation poll failed: {exc}"
            ) from exc

    response: Any = getattr(operation, "response", None)
    generated = getattr(response, "generated_videos", None) if response else None
    if not generated:
        # Veo rejects some prompts under safety / memorization checks; the
        # operation completes without a video. Surface a clear code so the
        # caller can show an actionable message.
        err = getattr(operation, "error", None)
        msg = str(err) if err else "Veo returned no generated video"
        raise ProviderError("VEO_NO_OUTPUT", msg)

    video_obj = generated[0].video
    try:
        client.files.download(file=video_obj)
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(
            "VEO_DOWNLOAD_FAILED", f"Veo file download failed: {exc}"
        ) from exc

    video_bytes = getattr(video_obj, "video_bytes", None)
    if not video_bytes:
        raise ProviderError(
            "VEO_NO_OUTPUT", "Veo generated_video has no bytes after download"
        )
    return bytes(video_bytes)

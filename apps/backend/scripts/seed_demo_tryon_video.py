"""Pre-generate a Veo 3.1 video for one specific try-on result.

Demo tool. Steps:
  1. Read the still try-on image from `tryon-results` Storage.
  2. Call Gemini Veo 3.1 Fast (image-to-video) — synchronous, polls
     until the long-running operation completes (~30-180 s).
  3. Upload the resulting MP4 back to `tryon-results` Storage under
     `videos/<user_id>/<tryon_result_id>.mp4`.
  4. Update `tryon_results.video_storage_path` + `video_generated_at`.

The web UI's closet detail page reads `video_storage_path` and renders
a `<video>` player when the column is non-null. Pre-seeding it for the
demo product means the click-through is instant and Veo's 1-6 minute
generation never runs live.

Migration `20260424120000_tryon_video.sql` must be applied first.

Usage (from apps/backend/):
    uv run python scripts/seed_demo_tryon_video.py \\
        --tryon-result-id c2f86f7c-cf11-4e38-a461-90d750c65afe \\
        --prompt 'Slow cinematic dolly-in on the model … editorial.'
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from typing import Any

from mirror.core.config import get_settings
from mirror.integrations.gemini_video import generate_tryon_video
from mirror.integrations.supabase_client import create_service_client

DEFAULT_PROMPT = (
    "Slow cinematic dolly-in on the model. They shift weight subtly, "
    "tilt their head toward camera, and hold the pose. Soft golden-hour "
    "natural light, fashion editorial style, ambient street sounds. "
    "Preserve the person's appearance and outfit exactly."
)


def _download_from_storage(sb: Any, bucket: str, path: str) -> bytes:
    """Service-role read from a private Supabase Storage bucket."""
    res = sb.storage.from_(bucket).download(path)
    if isinstance(res, (bytes, bytearray)):
        return bytes(res)
    raise SystemExit(
        f"Storage download for {bucket}/{path} returned non-bytes: {type(res)}"
    )


def _upload_to_storage(
    sb: Any, bucket: str, path: str, data: bytes, content_type: str
) -> None:
    """Idempotent upsert — overwrites if path already exists."""
    sb.storage.from_(bucket).upload(
        path,
        data,
        {"content-type": content_type, "x-upsert": "true"},
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tryon-result-id", required=True)
    p.add_argument("--prompt", default=DEFAULT_PROMPT)
    p.add_argument(
        "--bucket",
        default="tryon-results",
        help="Storage bucket for both source image and output video.",
    )
    args = p.parse_args()

    settings = get_settings()
    sb = create_service_client(settings)

    # 1. Resolve the try-on result row.
    res = (
        sb.table("tryon_results")
        .select("id, user_id, storage_path, thumbnail_storage_path, video_storage_path")
        .eq("id", args.tryon_result_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise SystemExit(f"No tryon_results row for id={args.tryon_result_id}")
    row = rows[0]
    user_id = row["user_id"]
    image_path = row.get("storage_path") or row.get("thumbnail_storage_path")
    if not image_path:
        raise SystemExit("Try-on result has no storage_path or thumbnail_storage_path.")
    if row.get("video_storage_path"):
        print(f"⚠ Existing video at {row['video_storage_path']} — overwriting.")

    # 2. Pull bytes.
    print(f"→ downloading {args.bucket}/{image_path} …")
    image_bytes = _download_from_storage(sb, args.bucket, image_path)
    print(f"  got {len(image_bytes):,} bytes")

    # Try-on results from FASHN are typically PNG; from Gemini editorial
    # they're also PNG. Default to image/png; Veo accepts both.
    image_mime = "image/png"
    if image_path.lower().endswith((".jpg", ".jpeg")):
        image_mime = "image/jpeg"

    # 3. Run Veo (long-running, 30-180 s typical for 3.1 Fast at 720p).
    print(f"→ submitting to Veo (prompt={args.prompt[:70]}…)")
    video_bytes = generate_tryon_video(
        settings,
        image_bytes=image_bytes,
        image_mime=image_mime,
        prompt=args.prompt,
    )
    print(f"  Veo returned {len(video_bytes):,} bytes of MP4")

    # 4. Upload + update row.
    # `<user_id>` first so tryon-results storage RLS lets the user read it
    # back via signed URL from the browser. Mirrors the worker's convention.
    video_path = f"{user_id}/videos/{args.tryon_result_id}.mp4"
    print(f"→ uploading {args.bucket}/{video_path} …")
    _upload_to_storage(sb, args.bucket, video_path, video_bytes, "video/mp4")
    now_iso = datetime.now(UTC).isoformat()
    sb.table("tryon_results").update(
        {"video_storage_path": video_path, "video_generated_at": now_iso}
    ).eq("id", args.tryon_result_id).execute()

    print(f"✓ Done. tryon_results.video_storage_path = {video_path}")
    print(f"  video_generated_at = {now_iso}")
    print()
    print("Web closet detail will now render the <video> player on next reload.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

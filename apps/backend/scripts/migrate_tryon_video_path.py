"""One-off: copy existing tryon-result MP4s from the legacy
`videos/<user_id>/<id>.mp4` layout to the RLS-compatible
`<user_id>/videos/<id>.mp4` layout, then update
`tryon_results.video_storage_path`.

Background: the tryon-results bucket's storage RLS policy requires the
first path segment to equal `auth.uid()` (pattern `auth.uid()::text || '/%'`).
Videos written under `videos/<uid>/…` failed `createSignedUrl` from the
browser with a masked 404 ("Object not found"). The worker + seeder now
write the correct layout, but the demo row already has an MP4 at the old
path — this script moves it without triggering a fresh Veo run.

Idempotent: if the new path already exists it just updates the row.
Usage (from apps/backend/):
    uv run python scripts/migrate_tryon_video_path.py
"""

from __future__ import annotations

import sys
from typing import Any

from mirror.core.config import get_settings
from mirror.integrations.supabase_client import create_service_client

BUCKET = "tryon-results"


def _download(sb: Any, path: str) -> bytes | None:
    try:
        res = sb.storage.from_(BUCKET).download(path)
    except Exception as exc:  # noqa: BLE001
        print(f"  download {path} failed: {exc}")
        return None
    if isinstance(res, (bytes, bytearray)):
        return bytes(res)
    return None


def _upload(sb: Any, path: str, data: bytes) -> None:
    sb.storage.from_(BUCKET).upload(
        path,
        data,
        {"content-type": "video/mp4", "x-upsert": "true"},
    )


def main() -> None:
    sb = create_service_client(get_settings())

    res = (
        sb.table("tryon_results")
        .select("id, user_id, video_storage_path")
        .not_.is_("video_storage_path", "null")
        .execute()
    )
    rows = res.data or []
    if not rows:
        print("No rows with video_storage_path — nothing to migrate.")
        return

    migrated = 0
    skipped = 0
    for r in rows:
        tid = r["id"]
        uid = r["user_id"]
        old = r["video_storage_path"]
        new = f"{uid}/videos/{tid}.mp4"
        if old == new:
            skipped += 1
            continue
        print(f"\n• {tid}")
        print(f"  old = {old}")
        print(f"  new = {new}")

        # If the new path already has an object, skip the copy.
        existing_new = _download(sb, new)
        if existing_new is None:
            data = _download(sb, old)
            if data is None:
                print("  ⚠ old object missing — skipping, nothing to copy.")
                continue
            print(f"  copying {len(data):,} bytes …")
            _upload(sb, new, data)
        else:
            print(f"  new path already has {len(existing_new):,} bytes — reusing.")

        sb.table("tryon_results").update({"video_storage_path": new}).eq(
            "id", tid
        ).execute()
        print("  ✓ row updated")
        migrated += 1

    print(f"\nDone. migrated={migrated} skipped={skipped}")
    print(
        "Old objects are left in place so this script stays reversible; "
        "delete them via Supabase dashboard once you've verified the new "
        "path works in the browser."
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

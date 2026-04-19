"""Pre-seed the reverse-search cache for a specific PDP.

Demo tool. Bypasses the live SerpAPI + Apify + Gemini pipeline by writing a
single `reverse_search_results` row with a curated `web_results` JSONB. The
extension's POST /api/v1/reverse-search will `cache_hit=true` on this
product and the worker is never invoked.

Usage (from apps/backend/):

    uv run python scripts/seed_demo_worn_by.py \\
        --canonical-url 'https://www.zara.com/...' \\
        --product-name  'Cropped Fit Fireman Clasp Jacket' \\
        --product-brand 'Zara' \\
        --product-image 'https://static.zara.net/.../p.jpg?...' \\
        --json-file scripts/demo_worn_by_zara_cropped_fireman.json \\
        --expires-days 30

The curation JSON is an array of `WebVisualMatch` rows
({image_url, source_url, source_host, title, visual_score}).

Idempotent: soft-deletes any prior live cache row for
(canonical_url_hash, provider='composite', prompt_version) before
inserting, so re-running swaps the curation cleanly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from mirror.core.config import get_settings
from mirror.core.product_catalog import upsert_product_from_extracted
from mirror.core.visual_search.service import PROMPT_VERSION
from mirror.integrations.supabase_client import create_service_client

SEED_PROVIDER = "composite"


def _validate_web_results(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list) or not rows:
        raise SystemExit("curation JSON must be a non-empty array of web matches")
    required = {"image_url", "source_url", "source_host", "title", "visual_score"}
    out: list[dict[str, Any]] = []
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            raise SystemExit(f"row {i}: expected object, got {type(r).__name__}")
        missing = required - set(r.keys())
        if missing:
            raise SystemExit(f"row {i}: missing keys {sorted(missing)}")
        out.append(
            {
                "image_url": str(r["image_url"]),
                "source_url": str(r["source_url"]),
                "source_host": str(r["source_host"]),
                "title": str(r["title"]),
                "visual_score": float(r["visual_score"]),
            }
        )
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--canonical-url", required=True)
    p.add_argument("--json-file", required=True, type=Path)
    p.add_argument("--product-name", default="")
    p.add_argument("--product-brand", default="")
    p.add_argument("--product-image", default="")
    p.add_argument("--expires-days", type=int, default=30)
    args = p.parse_args()

    rows = _validate_web_results(json.loads(args.json_file.read_text()))

    settings = get_settings()
    sb = create_service_client(settings)

    # 1. Upsert the products row so the extension's POST (with or without
    #    `extracted`) resolves to a catalog id. Reuses the same helper the
    #    `/reverse-search` router uses in production.
    extracted = {
        "name": args.product_name or "Demo product",
        "brand": args.product_brand,
        "image": args.product_image,
    }
    product = upsert_product_from_extracted(sb, args.canonical_url, extracted)

    # 2. Canonical hash — identical recipe to product_catalog.py (SHA-256 of
    #    the full URL string), matches what find_cached_web_results looks up.
    canonical_hash = hashlib.sha256(args.canonical_url.encode()).hexdigest()

    # 3. Soft-delete any prior live cache row for this key so the partial
    #    unique index doesn't reject the new insert. Mirrors the worker's
    #    refresh-after-expiry behavior.
    sb.table("reverse_search_results").update(
        {"deleted_at": datetime.now(UTC).isoformat()}
    ).eq("canonical_url_hash", canonical_hash).eq(
        "provider", SEED_PROVIDER
    ).eq("prompt_version", PROMPT_VERSION).is_(
        "deleted_at", "null"
    ).execute()

    # 4. Insert the fresh curated row with a far-future expiry so the cache
    #    guard in service.find_cached_web_results serves it for the demo.
    expires = (datetime.now(UTC) + timedelta(days=args.expires_days)).isoformat()
    ins = (
        sb.table("reverse_search_results")
        .insert(
            {
                "canonical_url_hash": canonical_hash,
                "provider": SEED_PROVIDER,
                "prompt_version": PROMPT_VERSION,
                "web_results": rows,
                "expires_at": expires,
            }
        )
        .execute()
    )
    if not ins.data:
        raise SystemExit("insert returned no data — check Supabase RLS / service-role key")

    print(f"✓ Product:        {product['id']}  {args.product_name!r}")
    print(f"  canonical_hash: {canonical_hash}")
    print(f"  provider:       {SEED_PROVIDER}  prompt_version={PROMPT_VERSION}")
    print(f"  curated rows:   {len(rows)}")
    print(f"  expires at:     {expires}")
    inserted_row = ins.data[0] if isinstance(ins.data, list) and ins.data else {}
    result_id = inserted_row["id"] if isinstance(inserted_row, dict) else "?"
    print(f"  result id:      {result_id}")
    print()
    print("Extension POST /api/v1/reverse-search on this PDP will now")
    print("return cache_hit=true with these web_results inline.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

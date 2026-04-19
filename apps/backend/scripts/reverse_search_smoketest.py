"""Ad-hoc smoke test for the reverse-search composite provider.

Runs the same code path the `mirror-reverse-search-worker` uses, but
directly in-process so per-provider latency + match counts are visible on
stdout without round-tripping through HTTP + Supabase polling.

Usage (from `apps/backend/`):

    uv run python scripts/reverse_search_smoketest.py \\
      --image-url 'https://cdn.example.com/product.jpg' \\
      --text-query 'Brand product title' \\
      [--brand zara --canonical-url 'https://www.zara.com/...p01234567.html'] \\
      [--filter]

When `--brand zara --canonical-url ...` are both provided the script
synthesizes a minimal product dict and calls the `brand_tuning/`
registry's `build_queries(...)` so the Apify children receive
Zara-tuned Pinterest boards + reference-code hashtags instead of the
generic text fallback.

Env: reads `.env` for `SERPAPI_API_KEY`, `APIFY_API_TOKEN`,
`GEMINI_API_KEY`, `GEMINI_PERSON_FILTER_MODEL`,
`VISUAL_SEARCH_PROVIDER`.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Any

from mirror.core.closet.enrichment import download_image_bytes
from mirror.core.config import get_settings
from mirror.core.logging_config import configure_logging
from mirror.core.visual_search.brand_tuning import get_brand_tuning
from mirror.core.visual_search.providers import get_provider
from mirror.integrations.gemini_person_filter import filter_images_for_persons


def _short(s: str | None, n: int) -> str:
    if not s:
        return ""
    s = s.strip().replace("\n", " ")
    return s[:n] + ("…" if len(s) > n else "")


async def _run(
    *,
    image_url: str,
    text_query: str,
    brand: str | None,
    canonical_url: str | None,
    apply_filter: bool,
) -> int:
    configure_logging()
    settings = get_settings()

    provider = get_provider(settings)
    print(f"\n=== provider: {provider.name} (available={provider.is_available(settings)}) ===")
    print(f"image_url  : {image_url}")
    print(f"text_query : {text_query}")

    candidate_queries = None
    if brand and canonical_url:
        # Build a minimal product-row dict so the registry match() fires and
        # `build_queries(...)` can extract slug + reference code from the URL.
        product_like: dict[str, Any] = {
            "brand": brand,
            "canonical_url": canonical_url,
            "name": text_query,
        }
        tuning = get_brand_tuning(product_like)
        if tuning is None:
            print(
                f"[warn] --brand={brand} given but no tuning module matches; "
                "falling back to text-query path"
            )
        else:
            candidate_queries = tuning.build_queries(
                product_like, image_url=image_url
            )
            print(f"brand tuning : {tuning.name}")
            print(
                "queries      :",
                {
                    "pinterest_keyword": candidate_queries.pinterest_keyword
                    if candidate_queries
                    else None,
                    "pinterest_boards": candidate_queries.pinterest_boards
                    if candidate_queries
                    else None,
                    "instagram_hashtags": candidate_queries.instagram_hashtags[:5]
                    if candidate_queries
                    else None,
                    "reference_code": candidate_queries.reference_code
                    if candidate_queries
                    else None,
                },
            )

    print()
    print("--- composite.lookup(…) ---")
    matches = await provider.lookup(
        candidate_image_url=image_url,
        candidate_image_bytes=None,
        candidate_text_query=text_query,
        candidate_queries=candidate_queries,
        limit=24,
    )
    print(f"\nmerged+deduped: {len(matches)} matches")
    for i, m in enumerate(matches[:15], 1):
        print(
            f" {i:2}. score={float(m['visual_score']):.3f}"
            f"  host={m['source_host']:<22}"
            f"  title={_short(m['title'], 52)}"
        )
        print(f"     img  = {_short(m['image_url'], 110)}")

    if not apply_filter:
        print("\n[skipping person-filter — pass --filter to enable]")
        return 0
    if not matches:
        print("\n[person-filter skipped — no matches to filter]")
        return 0

    print("\n--- downloading top-20 for person-filter ---")
    to_filter = matches[:20]
    downloaded: list[tuple[dict[str, Any], bytes, str]] = []
    for m in to_filter:
        try:
            b, mime = await download_image_bytes(m["image_url"])
            downloaded.append((m, b, mime))
        except Exception as exc:  # noqa: BLE001
            print(f"  [skip] download failed for {m['image_url'][:80]}: {exc}")
    print(f"downloaded {len(downloaded)}/{len(to_filter)}")
    if not downloaded:
        return 0

    mask = await filter_images_for_persons(
        settings, [(b, mime) for _, b, mime in downloaded]
    )
    kept = [downloaded[i][0] for i, keep in enumerate(mask) if keep]
    print(
        f"\nperson-filter kept {len(kept)}/{len(downloaded)} "
        f"({len(downloaded) - len(kept)} dropped as not-a-person / no-clothing)"
    )
    for i, m in enumerate(kept[:10], 1):
        print(
            f" {i:2}. host={m['source_host']:<22}  "
            f"img = {_short(m['image_url'], 110)}"
        )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--image-url",
        required=True,
        help="Public URL of the product image. SerpAPI Lens requires this.",
    )
    parser.add_argument(
        "--text-query",
        default="",
        help="Free-form product title used by Apify fallback providers.",
    )
    parser.add_argument(
        "--brand",
        default=None,
        help="Brand key to hit the tuning registry (e.g. 'zara').",
    )
    parser.add_argument(
        "--canonical-url",
        default=None,
        help="Canonical product URL; required when --brand is set (Zara needs it for the SKU).",
    )
    parser.add_argument(
        "--filter",
        action="store_true",
        help="Also run the Gemini person-filter on the top-20 results.",
    )
    args = parser.parse_args()
    rc = asyncio.run(
        _run(
            image_url=args.image_url,
            text_query=args.text_query,
            brand=args.brand,
            canonical_url=args.canonical_url,
            apply_filter=args.filter,
        )
    )
    sys.exit(rc)


if __name__ == "__main__":
    main()

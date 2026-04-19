"""Unit tests for Zara multi-signal query builder."""

from __future__ import annotations

from mirror.core.visual_search.zara_query import (
    build_zara_queries,
    extract_slug_and_code_from_url,
    is_zara_product,
)


def test_extract_slug_and_code() -> None:
    slug, code = extract_slug_and_code_from_url(
        "https://www.zara.com/us/en/linen-blend-safari-jacket-p05520403.html"
    )
    assert slug == "linen-blend-safari-jacket"
    assert code == "05520403"


def test_is_zara_product_by_url() -> None:
    assert is_zara_product({"canonical_url": "https://www.zara.com/us/en/x-p1.html"})
    assert not is_zara_product({"canonical_url": "https://example.com/p"})


def test_build_zara_queries_structure() -> None:
    q = build_zara_queries(
        {
            "canonical_url": "https://www.zara.com/us/en/woman/jackets/linen-jacket-p05520403.html",
            "name": "Linen Jacket",
            "brand": "Zara",
        },
        image_url="https://cdn.zara.com/img.jpg",
    )
    assert "zara" in q.pinterest_keyword.lower()
    assert q.pinterest_boards
    assert q.instagram_hashtags
    assert q.image_url == "https://cdn.zara.com/img.jpg"
    assert q.reference_code == "05520403"
    assert "zarawoman" not in q.instagram_hashtags
    assert "zara05520403" in q.instagram_hashtags


def test_instagram_broad_tags_when_no_reference_code_in_url() -> None:
    q = build_zara_queries(
        {
            "canonical_url": "https://www.zara.com/us/en/legacy-path-without-ref",
            "name": "Dress",
            "brand": "Zara",
        },
        image_url="https://cdn.zara.com/x.jpg",
    )
    assert q.reference_code is None
    # Broad brand+gender hashtags (plurals, higher IG volume — see
    # zara_query.py comment for the 2026-04-19 smoke-test findings).
    assert (
        "zarawomen" in q.instagram_hashtags
        or "zaramen" in q.instagram_hashtags
    )

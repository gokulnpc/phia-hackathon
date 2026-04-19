"""Instagram caption relevance gate (keyword + reference code)."""

from __future__ import annotations

from mirror.core.visual_search.apify_instagram import (
    _caption_relevant_to_product,
    _keep_instagram_row_caption,
)
from mirror.core.visual_search.zara_query import ZaraQueries


def test_reference_code_in_caption() -> None:
    q = ZaraQueries(
        pinterest_keyword="",
        pinterest_boards=[],
        instagram_hashtags=[],
        image_url="",
        reference_code="05520403",
    )
    assert _caption_relevant_to_product(
        "Love this #zara05520403 haul",
        candidate_text_query="",
        candidate_queries=q,
    )


def test_title_token_in_caption() -> None:
    assert _caption_relevant_to_product(
        "asymmetric ruffle dress ootd",
        candidate_text_query="ASYMMETRIC RUFFLE",
        candidate_queries=None,
    )


def test_non_latin_caption_skips_gate() -> None:
    q = ZaraQueries(
        pinterest_keyword="",
        pinterest_boards=[],
        instagram_hashtags=[],
        image_url="",
        reference_code="05520403",
    )
    arabic_caption = "حقيبة جميلة من المتجر"
    assert _keep_instagram_row_caption(
        arabic_caption,
        candidate_text_query="bag",
        candidate_queries=q,
    )

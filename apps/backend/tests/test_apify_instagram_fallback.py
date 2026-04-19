"""Unit tests for the generic text→hashtag fallback in `apify_instagram`.

Covers the non-Zara path: when `candidate_queries.instagram_hashtags` is
empty (no brand tuning for this product), the provider derives hashtags
from the PDP text query so IG UGC still surfaces in composite results.
"""

from __future__ import annotations

from mirror.core.visual_search.apify_instagram import _fallback_hashtags_from_text


def test_empty_text_returns_empty() -> None:
    assert _fallback_hashtags_from_text("") == []
    assert _fallback_hashtags_from_text("   ") == []


def test_only_stopwords_returns_empty() -> None:
    # "the a and of" — all filtered → no hashtags → provider short-circuits
    # rather than spamming the actor with noise.
    assert _fallback_hashtags_from_text("the a and of") == []


def test_single_product_title_produces_slug_plus_tokens() -> None:
    tags = _fallback_hashtags_from_text("Cropped striped cotton jacket", cap=5)
    # Concatenated slug is highest-signal — leads the list.
    assert tags[0] == "croppedstripedcottonjacket"
    # Remaining entries are the long-enough non-stopword tokens, in order.
    assert "striped" in tags
    assert "cotton" in tags
    assert "jacket" in tags
    # "cropped" would also qualify but the slug already contains it.
    assert len(tags) <= 5


def test_lowercase_and_strips_punctuation() -> None:
    tags = _fallback_hashtags_from_text("Men's Linen BLAZER - Spring 2025!")
    # No uppercase, no apostrophes/dashes/digits-preserving-but-clean.
    assert all(t == t.lower() for t in tags)
    assert all("'" not in t and "-" not in t for t in tags)


def test_cap_is_respected() -> None:
    long_title = "denim jacket navy stretch cropped boxy oversized unisex streetwear"
    tags = _fallback_hashtags_from_text(long_title, cap=3)
    assert len(tags) <= 3


def test_slug_dropped_when_too_long() -> None:
    # 30-char IG hashtag ceiling: if the full slug is longer, only tokens
    # come through. (Slug "supercalifragilisticexpialidociousextra" is > 30.)
    tags = _fallback_hashtags_from_text(
        "supercalifragilisticexpialidocious extra",
    )
    # The first entry should NOT be the oversized concatenation.
    assert tags and len(tags[0]) <= 30


def test_short_tokens_filtered() -> None:
    # 4-char minimum keeps noise like "hm", "tee", "mod" out.
    tags = _fallback_hashtags_from_text("hm tee mod")
    # Slug passes (length check) but individual tokens are each < 4 chars.
    assert tags == ["hmteemod"]

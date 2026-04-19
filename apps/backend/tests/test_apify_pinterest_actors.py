"""Unit tests for Apify Pinterest's multi-actor input/output handling.

The composite provider can be pointed at either:
  - `scraperforge~pinterest-search-scraper` — legacy/default, `{query, filter, limit}` input
  - `epctex/pinterest-scraper` — paid alternative, `{search, maxItems, proxy}` input
     with a deeply nested `images` output shape

Both should "just work" when `APIFY_PINTEREST_ACTOR_ID` is switched in env.
"""

from __future__ import annotations

from mirror.core.visual_search.apify_pinterest import (
    _build_search_payload,
    _pin_image_url,
    _pin_page_url,
    _pin_title,
)

# --- input payload ---------------------------------------------------------


def test_scraperforge_payload_default() -> None:
    p = _build_search_payload("scraperforge~pinterest-search-scraper", "zara jacket", 40)
    assert p["query"] == "zara jacket"
    assert p["filter"] == "all"
    assert p["limit"] == 40
    assert "search" not in p
    assert "proxy" not in p


def test_epctex_payload_shape() -> None:
    p = _build_search_payload("epctex/pinterest-scraper", "zara jacket", 40)
    assert p["search"] == "zara jacket"
    assert p["maxItems"] == 40
    assert p["proxy"] == {"useApifyProxy": True}
    assert "query" not in p
    assert "filter" not in p
    assert "limit" not in p


def test_epctex_tilde_form_also_detected() -> None:
    # Apify accepts both `owner/name` and `owner~name` forms; substring match
    # on "epctex" covers both.
    p = _build_search_payload("epctex~pinterest-scraper", "q", 10)
    assert p["search"] == "q"
    assert "query" not in p


def test_unknown_actor_falls_back_to_scraperforge_shape() -> None:
    # Lets someone point at an entirely different Pinterest actor without
    # silently breaking — worst case they get the legacy payload and can
    # submit a PR with their actor's shape.
    p = _build_search_payload("someone-else/custom-pinterest", "q", 10)
    assert "query" in p
    assert "search" not in p


# --- output parsing (scraperforge flat shape) -----------------------------


def test_scraperforge_flat_image_url() -> None:
    row = {"image": "https://i.pinimg.com/orig/abc.jpg"}
    assert _pin_image_url(row) == "https://i.pinimg.com/orig/abc.jpg"


def test_scraperforge_media_dict_url() -> None:
    row = {"media": {"url": "https://i.pinimg.com/orig/xyz.jpg"}}
    assert _pin_image_url(row) == "https://i.pinimg.com/orig/xyz.jpg"


# --- output parsing (epctex nested shape) ---------------------------------


def test_epctex_nested_images_prefers_orig() -> None:
    row = {
        "images": {
            "236x": {"url": "https://i.pinimg.com/236x/a.jpg"},
            "474x": {"url": "https://i.pinimg.com/474x/a.jpg"},
            "orig": {"url": "https://i.pinimg.com/orig/a.jpg"},
        }
    }
    # Prefers highest-resolution available.
    assert _pin_image_url(row) == "https://i.pinimg.com/orig/a.jpg"


def test_epctex_nested_images_falls_back_when_orig_missing() -> None:
    row = {
        "images": {
            "236x": {"url": "https://i.pinimg.com/236x/a.jpg"},
            "736x": {"url": "https://i.pinimg.com/736x/a.jpg"},
        }
    }
    # 736x beats 236x per the size-priority ordering.
    assert _pin_image_url(row) == "https://i.pinimg.com/736x/a.jpg"


def test_epctex_closeup_description_as_title() -> None:
    row = {
        "closeup_unified_description": "Street style: cropped striped fireman jacket in ecru",
        "description": "Shorter fallback",
    }
    # closeup_unified_description is the richest title source on epctex — use it first.
    t = _pin_title(row)
    assert t.startswith("Street style: cropped striped fireman jacket")


def test_epctex_url_and_description_both_parse() -> None:
    # An end-to-end-ish check: a realistic epctex row produces usable
    # image_url + source_url + title.
    row = {
        "id": "1096556209247124248",
        "url": "https://www.pinterest.com/pin/1096556209247124248",
        "closeup_unified_description": "Whimsical cropped jacket look",
        "images": {
            "orig": {"url": "https://i.pinimg.com/orig/xyz.jpg"},
            "474x": {"url": "https://i.pinimg.com/474x/xyz.jpg"},
        },
    }
    assert _pin_image_url(row) == "https://i.pinimg.com/orig/xyz.jpg"
    assert _pin_page_url(row) == "https://www.pinterest.com/pin/1096556209247124248"
    assert "cropped jacket" in _pin_title(row).lower()

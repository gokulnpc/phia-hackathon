"""Unit tests for FASHN category mapping used by try-on + editorial workers."""

from mirror.core.tryon_fashn_category import fashn_category_from_metadata


def test_maps_top_buckets() -> None:
    assert fashn_category_from_metadata({"category": "top"}) == "tops"
    assert fashn_category_from_metadata({"category": "outerwear"}) == "tops"


def test_maps_bottom_and_dress() -> None:
    assert fashn_category_from_metadata({"category": "bottom"}) == "bottoms"
    assert fashn_category_from_metadata({"category": "dress"}) == "one-pieces"


def test_auto_for_unknown() -> None:
    assert fashn_category_from_metadata({}) == "auto"
    assert fashn_category_from_metadata({"category": "hat"}) == "auto"

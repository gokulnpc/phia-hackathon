"""Build Pinterest / Instagram / Lens query strings for Zara PDPs."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

_ZARA_URL_RE = re.compile(r"/([^/]+)-p(\d+)\.html", re.IGNORECASE)
_NON_ALNUM = re.compile(r"[^a-z0-9]+", re.IGNORECASE)
_MAX_INSTAGRAM_HASHTAGS = 10


@dataclass(frozen=True)
class ZaraQueries:
    """Structured search signals for Apify + SerpAPI composite."""

    pinterest_keyword: str
    pinterest_boards: list[str]
    instagram_hashtags: list[str]
    image_url: str
    #: Digits from `-pXXXXXXXX` URL segment; used for IG caption relevance checks.
    reference_code: str | None = None


def is_zara_product(row: dict[str, Any] | None) -> bool:
    if not row:
        return False
    url = str(row.get("canonical_url") or "")
    brand = str(row.get("brand") or "").strip().lower()
    if "zara.com" in url.lower():
        return True
    return brand == "zara"


def extract_slug_and_code_from_url(url: str) -> tuple[str | None, str | None]:
    m = _ZARA_URL_RE.search(url)
    if not m:
        return None, None
    return m.group(1), m.group(2)


def _gender_token_from_url(url: str) -> str:
    u = url.lower()
    if "/woman/" in u or "/women/" in u:
        return "women"
    if "/man/" in u or "/men/" in u:
        return "men"
    return ""


def _clean_product_title(name: str) -> str:
    t = name.strip()
    if not t:
        return ""
    # Drop trailing site noise if still present
    if "|" in t:
        t = t.split("|")[0].strip()
    return t


def _slug_to_compact_hashtag(slug: str) -> str:
    raw = _NON_ALNUM.sub("", slug.lower())
    if not raw.startswith("zara"):
        raw = "zara" + raw
    return raw[:30]


def _reference_code_instagram_tags(code: str) -> list[str]:
    """High-precision hashtags from Zara `-pXXXXXXXX` reference (what shoppers tag)."""
    c = code.strip()
    if not c.isdigit():
        return []
    stripped = c.lstrip("0") or c
    tags: list[str] = []
    for cand in (f"zara{c}", f"zara{stripped}", stripped):
        tl = cand.strip().lstrip("#").lower()
        if tl and tl not in tags:
            tags.append(tl)
    return tags


def build_zara_queries(product: dict[str, Any], *, image_url: str) -> ZaraQueries:
    """Derive multi-signal queries from a `products` row (after Zara refresh)."""
    url = str(product.get("canonical_url") or "")
    slug, ref_code = extract_slug_and_code_from_url(url)
    title = _clean_product_title(str(product.get("name") or ""))
    gender = _gender_token_from_url(url)

    gender_word = gender or "women"
    core = title or (slug.replace("-", " ") if slug else "zara outfit")
    pinterest_keyword = f"zara {gender_word} {core}".strip()
    # Boards are broader seasonal / mood queries that surface editorial repins.
    year = str(datetime.now(UTC).year)
    pinterest_boards = [
        f"zara {gender_word} outfit",
        f"zara summer {year} {gender_word}",
        f"zara street style {gender_word}",
    ]

    # Instagram hashtag strategy (ordered broadest → narrowest):
    #
    # The downstream Apify caption-relevance gate (`apify_instagram.py:82-102`)
    # drops posts whose captions don't mention the product keywords, so a
    # high-volume tag + strict post filter beats a hyper-specific tag with
    # zero posts. Empirically (smoke test, 2026-04-19):
    #   - `#zara06987468712` → 0 posts (SKU tags basically never hit)
    #   - `#zaracroppedstripedfiremanclasp` → 0 posts (over-specific slug)
    #   - `#zarawomen` / `#zaraoutfit` → tens of thousands/day
    # So we lead with brand+gender+intent tags and relegate the SKU/slug
    # hashtags to the tail. Caption gate handles relevance.
    gender_tag = "zarawomen" if gender_word == "women" else "zaramen"
    tags: list[str] = [
        gender_tag,
        "zaraoutfit",
        "zaradaily",
        "zarahaul",
    ]

    # Category-level hashtag derived from the product title
    # (`jacket` → `#zarajacket`). More specific than `#zaraoutfit` but still
    # high-volume for common items.
    title_for_cat = title or (slug.replace("-", " ") if slug else "")
    title_lower = title_for_cat.lower()
    for cat_word in (
        "jacket", "coat", "dress", "skirt", "pants", "trousers", "jeans",
        "shirt", "blouse", "top", "shorts", "blazer", "cardigan", "sweater",
    ):
        if cat_word in title_lower:
            tags.append(f"zara{cat_word}")
            break

    # Slug-based (medium precision) — kept in case the user tagged specifically.
    if slug:
        compact = _slug_to_compact_hashtag(slug).strip().lstrip("#").lower()
        if compact and compact not in tags:
            tags.append(compact)

    # SKU-specific (low recall, high precision when it does hit). Last so the
    # actor's budget isn't spent on these when the high-volume tags fill the
    # cap first.
    if ref_code:
        for t in _reference_code_instagram_tags(ref_code):
            if t not in tags:
                tags.append(t)

    # Dedupe while preserving order (specific tags first).
    seen: set[str] = set()
    instagram_hashtags: list[str] = []
    for t in tags:
        tt = t.strip().lstrip("#").lower()
        if tt and tt not in seen:
            seen.add(tt)
            instagram_hashtags.append(tt)
    instagram_hashtags = instagram_hashtags[:_MAX_INSTAGRAM_HASHTAGS]

    ref_norm = ref_code if ref_code and ref_code.isdigit() else None

    return ZaraQueries(
        pinterest_keyword=pinterest_keyword[:120],
        pinterest_boards=pinterest_boards,
        instagram_hashtags=instagram_hashtags,
        image_url=image_url.strip(),
        reference_code=ref_norm,
    )

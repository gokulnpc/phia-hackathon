"""Apify Instagram hashtag scraper → RawVisualMatch (image posts only)."""

from __future__ import annotations

from typing import Any

from mirror.core.config import Settings, get_settings
from mirror.core.visual_search.apify_client import run_sync_get_dataset_items
from mirror.core.visual_search.interface import RawVisualMatch
from mirror.core.visual_search.zara_query import ZaraQueries


def _is_videoish(row: dict[str, Any]) -> bool:
    t = row.get("type") or row.get("mediaType") or row.get("productType")
    if isinstance(t, str):
        tl = t.lower()
        if any(x in tl for x in ("video", "reel", "carousel")):
            return True
    if row.get("videoUrl") or row.get("video_url"):
        return True
    return row.get("isVideo") is True


def _image_url(row: dict[str, Any]) -> str | None:
    for key in ("displayUrl", "display_url", "image", "thumbnailSrc", "thumbnail_src"):
        v = row.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _post_url(row: dict[str, Any]) -> str | None:
    for key in ("url", "postUrl", "post_url", "link"):
        v = row.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    short = row.get("shortCode") or row.get("shortcode")
    if isinstance(short, str) and short.strip():
        return f"https://www.instagram.com/p/{short.strip()}/"
    return None


def _caption(row: dict[str, Any]) -> str:
    for key in ("caption", "text", "title"):
        v = row.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:300]
    return ""


# Drop English filler words that wouldn't pass a hashtag relevance gate —
# Instagram search tolerates stop words but they return mostly irrelevant
# posts, and the caption-relevance filter then drops those anyway.
_HASHTAG_STOPWORDS = frozenset(
    {
        "a", "an", "and", "the", "of", "for", "with", "in", "on", "to",
        "by", "at", "or", "but", "as", "is", "it", "this", "that", "men",
        "mens", "man", "women", "womens", "woman", "size", "new",
    }
)


def _fallback_hashtags_from_text(text: str, *, cap: int = 5) -> list[str]:
    """Derive up to `cap` Instagram hashtags from a free-form product title.

    Strategy, in priority order:
      1. One concatenated "slug" hashtag from the full text — highest signal
         for specific product names (`hmcroppedstripedtee` matches UGC).
      2. Individual long-enough non-stopword tokens (`striped`, `jacket`).
    Everything lowercased + non-alnum stripped.
    """
    import re

    cleaned = re.sub(r"[^a-z0-9\s]+", "", text.lower()).strip()
    if not cleaned:
        return []
    words = [w for w in cleaned.split() if w and w not in _HASHTAG_STOPWORDS]
    if not words:
        return []
    # IG hashtag char budget is 30 before the platform silently truncates.
    # Drop anything longer so we don't send search terms that won't match.
    tags: list[str] = []
    slug = "".join(words)
    if slug and 3 < len(slug) <= 30:
        tags.append(slug)
    for w in words:
        if 4 <= len(w) <= 30 and w not in tags:
            tags.append(w)
        if len(tags) >= cap:
            break
    return tags[:cap]


def _mostly_latin_letters(text: str) -> bool:
    """If caption is mostly non-Latin, skip keyword gate (avoid false drops)."""
    s = text.strip()
    if len(s) < 6:
        return True
    letters = sum(1 for c in s if c.isalpha())
    if letters == 0:
        return True
    latin = sum(1 for c in s if "a" <= c.lower() <= "z")
    return (latin / letters) >= 0.35


def _caption_relevant_to_product(
    caption: str,
    *,
    candidate_text_query: str,
    candidate_queries: ZaraQueries | None,
) -> bool:
    cap = caption.lower()
    ref = candidate_queries.reference_code if candidate_queries else None
    if isinstance(ref, str) and ref.isdigit():
        stripped = ref.lstrip("0") or ref
        if ref in cap or stripped in cap:
            return True
    for raw in candidate_text_query.replace("|", ",").replace(".", " ").split():
        w = "".join(c for c in raw if c.isalnum()).lower()
        if len(w) >= 4 and w in cap:
            return True
    return False


def _keep_instagram_row_caption(
    caption: str,
    *,
    candidate_text_query: str,
    candidate_queries: ZaraQueries | None,
) -> bool:
    ref = candidate_queries.reference_code if candidate_queries else None
    has_signal = bool(isinstance(ref, str) and ref.isdigit()) or bool(
        candidate_text_query.strip()
    )
    if not has_signal:
        return True
    if not caption.strip():
        return True
    if not _mostly_latin_letters(caption):
        return True
    return _caption_relevant_to_product(
        caption,
        candidate_text_query=candidate_text_query,
        candidate_queries=candidate_queries,
    )


class ApifyInstagramHashtagProvider:
    name = "apify_instagram"

    def is_available(self, settings: Settings) -> bool:
        return bool(settings.apify_api_token.strip())

    async def lookup(
        self,
        *,
        candidate_image_url: str,  # noqa: ARG002
        candidate_image_bytes: bytes | None,  # noqa: ARG002
        candidate_text_query: str,
        candidate_queries: ZaraQueries | None = None,
        limit: int = 24,
    ) -> list[RawVisualMatch]:
        # Hashtags: brand-tuned (Zara) → precomputed. Fallback for any other
        # brand → derive a handful of tags from the product text query so
        # non-tuned PDPs still surface IG UGC. The caption-relevance gate
        # below drops irrelevant posts regardless of hashtag source.
        if candidate_queries and candidate_queries.instagram_hashtags:
            hashtags = candidate_queries.instagram_hashtags[:15]
        else:
            hashtags = _fallback_hashtags_from_text(candidate_text_query, cap=5)
        if not hashtags:
            return []

        settings = get_settings()
        actor = settings.apify_instagram_actor_id.strip()
        timeout = settings.visual_search_composite_per_provider_timeout_s

        payload: dict[str, Any] = {
            "hashtags": hashtags,
            "resultsType": "posts",
            "resultsLimit": min(60, limit * 4),
        }

        rows = await run_sync_get_dataset_items(
            settings,
            actor_id=actor,
            payload=payload,
            timeout_s=max(timeout, 30.0),
        )

        matches: list[RawVisualMatch] = []
        usable = [r for r in rows if isinstance(r, dict) and not _is_videoish(r)]
        total = len(usable)
        for rank, row in enumerate(usable):
            img = _image_url(row)
            url = _post_url(row)
            if not img or not url:
                continue
            cap = _caption(row)
            if not _keep_instagram_row_caption(
                cap,
                candidate_text_query=candidate_text_query,
                candidate_queries=candidate_queries,
            ):
                continue
            visual_score = round(1.0 - (rank / max(total, 1)), 4)
            matches.append(
                {
                    "image_url": img,
                    "source_url": url,
                    "source_host": "instagram.com",
                    "title": cap,
                    "visual_score": visual_score,
                }
            )
            if len(matches) >= limit:
                break
        return matches

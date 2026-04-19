"""Tiny factory: pick a `VisualSearchProvider` based on `VISUAL_SEARCH_PROVIDER`."""

from __future__ import annotations

from mirror.core.config import Settings
from mirror.core.visual_search.composite import CompositeProvider
from mirror.core.visual_search.interface import VisualSearchProvider
from mirror.core.visual_search.mock import MockProvider
from mirror.core.visual_search.serpapi import SerpAPIProvider


def get_provider(settings: Settings) -> VisualSearchProvider:
    """Return the configured provider; falls back to Mock for unknown values
    so a bad env var never takes the feature offline."""
    name = (settings.visual_search_provider or "mock").strip().lower()
    if name == "composite":
        return CompositeProvider()
    if name == "serpapi":
        return SerpAPIProvider()
    return MockProvider()

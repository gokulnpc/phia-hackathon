"""Unit tests for visual-search providers (mock + serpapi). No live API calls."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from mirror.core.config import Settings
from mirror.core.errors import ProviderError
from mirror.core.visual_search.interface import RawVisualMatch
from mirror.core.visual_search.mock import MockProvider
from mirror.core.visual_search.providers import get_provider
from mirror.core.visual_search.serpapi import SERPAPI_ENDPOINT, SerpAPIProvider

# --- Mock provider ----------------------------------------------------------


def test_mock_provider_is_always_available() -> None:
    assert MockProvider().is_available(Settings()) is True


async def test_mock_provider_deterministic() -> None:
    p = MockProvider()
    a = await p.lookup(
        candidate_image_url="x",
        candidate_image_bytes=None,
        candidate_text_query="Balenciaga denim jacket",
    )
    b = await p.lookup(
        candidate_image_url="x",
        candidate_image_bytes=None,
        candidate_text_query="Balenciaga denim jacket",
    )
    assert a == b
    assert len(a) >= 1
    assert all(isinstance(m["image_url"], str) and m["image_url"] for m in a)
    assert all(0.0 <= m["visual_score"] <= 1.0 for m in a)


async def test_mock_provider_orders_by_score_desc() -> None:
    p = MockProvider()
    matches = await p.lookup(
        candidate_image_url="x",
        candidate_image_bytes=None,
        candidate_text_query="anything",
    )
    scores = [m["visual_score"] for m in matches]
    assert scores == sorted(scores, reverse=True)


# --- SerpAPI provider -------------------------------------------------------


def _monkey_async_get(
    monkeypatch: pytest.MonkeyPatch, handler: Any
) -> None:
    """Replace httpx.AsyncClient.get so tests don't hit the network."""

    class FakeClient:
        def __init__(self, *_: Any, **__: Any) -> None:
            pass

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *_: Any) -> None:
            return None

        async def get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
            result: httpx.Response = handler(url, params or {})
            return result

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)


def _settings_with_serpapi() -> Settings:
    return Settings(serpapi_api_key="test-key", visual_search_provider="serpapi")


def test_serpapi_is_available_only_with_key() -> None:
    assert SerpAPIProvider().is_available(Settings(serpapi_api_key="")) is False
    assert SerpAPIProvider().is_available(_settings_with_serpapi()) is True


async def test_serpapi_raises_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    from mirror.core import config as config_module

    monkeypatch.setattr(config_module, "get_settings", lambda: Settings(serpapi_api_key=""))
    p = SerpAPIProvider()
    with pytest.raises(ProviderError) as exc_info:
        await p.lookup(
            candidate_image_url="https://x/y.jpg",
            candidate_image_bytes=None,
            candidate_text_query="",
        )
    assert exc_info.value.code == "SERPAPI_NOT_CONFIGURED"


async def test_serpapi_parses_visual_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    from mirror.core import config as config_module

    monkeypatch.setattr(config_module, "get_settings", _settings_with_serpapi)

    payload = {
        "visual_matches": [
            {
                "title": "Look 1",
                "link": "https://www.editorial.example.com/looks/42",
                "thumbnail": "https://cdn.example.com/42.jpg",
            },
            {
                "title": "Street style",
                "link": "https://street.example.com/p/abc",
                "image": "https://cdn.example.com/abc.jpg",
            },
            # Rows missing a usable image or source are silently dropped.
            {"title": "No image", "link": "https://x.example.com"},
            {"title": "No link", "thumbnail": "https://cdn.example.com/orphan.jpg"},
        ]
    }

    def handler(url: str, params: dict[str, Any]) -> httpx.Response:
        assert url == SERPAPI_ENDPOINT
        assert params["engine"] == "google_lens"
        assert params["api_key"] == "test-key"
        return httpx.Response(200, json=payload)

    _monkey_async_get(monkeypatch, handler)

    p = SerpAPIProvider()
    matches: list[RawVisualMatch] = await p.lookup(
        candidate_image_url="https://cdn.example.com/candidate.jpg",
        candidate_image_bytes=None,
        candidate_text_query="",
    )
    assert len(matches) == 2
    assert matches[0]["source_host"] == "editorial.example.com"  # www. stripped
    assert matches[0]["image_url"] == "https://cdn.example.com/42.jpg"
    # Rank-order scoring: first result has the highest score.
    assert matches[0]["visual_score"] >= matches[1]["visual_score"]


async def test_serpapi_maps_http_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    from mirror.core import config as config_module

    monkeypatch.setattr(config_module, "get_settings", _settings_with_serpapi)

    def handler_429(_url: str, _params: dict[str, Any]) -> httpx.Response:
        return httpx.Response(429, json={"error": "quota"})

    _monkey_async_get(monkeypatch, handler_429)
    with pytest.raises(ProviderError) as exc:
        await SerpAPIProvider().lookup(
            candidate_image_url="x", candidate_image_bytes=None, candidate_text_query=""
        )
    assert exc.value.code == "SERPAPI_QUOTA_EXCEEDED"

    def handler_500(_url: str, _params: dict[str, Any]) -> httpx.Response:
        return httpx.Response(500)

    _monkey_async_get(monkeypatch, handler_500)
    with pytest.raises(ProviderError) as exc2:
        await SerpAPIProvider().lookup(
            candidate_image_url="x", candidate_image_bytes=None, candidate_text_query=""
        )
    assert exc2.value.code == "SERPAPI_BAD_RESPONSE"


async def test_serpapi_surfaces_structured_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from mirror.core import config as config_module

    monkeypatch.setattr(config_module, "get_settings", _settings_with_serpapi)

    def handler(_url: str, _params: dict[str, Any]) -> httpx.Response:
        return httpx.Response(200, json={"error": "Invalid API key"})

    _monkey_async_get(monkeypatch, handler)
    with pytest.raises(ProviderError) as exc:
        await SerpAPIProvider().lookup(
            candidate_image_url="x", candidate_image_bytes=None, candidate_text_query=""
        )
    assert exc.value.code == "SERPAPI_BAD_RESPONSE"
    assert "Invalid API key" in str(exc.value)


# --- Factory ---------------------------------------------------------------


def test_factory_selects_by_env() -> None:
    assert get_provider(Settings(visual_search_provider="mock")).name == "mock"
    assert (
        get_provider(Settings(visual_search_provider="serpapi", serpapi_api_key="k")).name
        == "serpapi"
    )
    assert get_provider(Settings(visual_search_provider="composite")).name == "composite"
    # Unknown values fall back to mock — bad env can't take the feature offline.
    assert get_provider(Settings(visual_search_provider="unknown")).name == "mock"

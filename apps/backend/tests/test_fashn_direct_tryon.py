"""Tests for Fash AI direct try-on integration."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from mirror.core.config import Settings
from mirror.core.errors import ProviderError
from mirror.integrations.fashn_direct_tryon import (
    fashn_output_image_url,
    run_fashn_tryon,
)


def _two_step_client(post_json: dict, status_json: dict) -> MagicMock:
    post_resp = MagicMock()
    post_resp.status_code = 200
    post_resp.json = MagicMock(return_value=post_json)

    status_resp = MagicMock()
    status_resp.status_code = 200
    status_resp.json = MagicMock(return_value=status_json)

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=post_resp)
    mock_client.get = AsyncMock(return_value=status_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


@pytest.mark.asyncio
async def test_run_fashn_tryon_success_normalizes_images() -> None:
    settings = Settings(fashn_api_key="secret")
    client = _two_step_client(
        {"id": "pred-1"},
        {"status": "completed", "output": ["https://cdn.fashn.ai/out.png"]},
    )
    with patch(
        "mirror.integrations.fashn_direct_tryon.httpx.AsyncClient",
        return_value=client,
    ):
        out = await run_fashn_tryon(
            settings,
            model_image="https://model/x.png",
            garment_image="https://shop/g.png",
            category="auto",
            mode="balanced",
        )
    assert fashn_output_image_url(out) == "https://cdn.fashn.ai/out.png"


@pytest.mark.asyncio
async def test_run_fashn_tryon_requires_api_key() -> None:
    settings = Settings(fashn_api_key="")
    with pytest.raises(ProviderError) as exc:
        await run_fashn_tryon(
            settings,
            model_image="a",
            garment_image="b",
            category="auto",
            mode="balanced",
        )
    assert exc.value.code == "PROVIDER_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_run_fashn_submit_http_error() -> None:
    settings = Settings(fashn_api_key="k")
    post_resp = MagicMock()
    post_resp.status_code = 400
    post_resp.text = "bad"
    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=post_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    with (
        patch(
            "mirror.integrations.fashn_direct_tryon.httpx.AsyncClient",
            return_value=mock_client,
        ),
        pytest.raises(ProviderError) as exc,
    ):
        await run_fashn_tryon(
            settings,
            model_image="a",
            garment_image="b",
            category="auto",
            mode="balanced",
        )
    assert exc.value.code == "PROVIDER_SUBMIT_FAILED"


@pytest.mark.asyncio
async def test_run_fashn_status_failed() -> None:
    settings = Settings(fashn_api_key="k")
    client = _two_step_client(
        {"id": "p1"},
        {"status": "failed", "error": "PoseError"},
    )
    with (
        patch(
            "mirror.integrations.fashn_direct_tryon.httpx.AsyncClient",
            return_value=client,
        ),
        pytest.raises(ProviderError) as exc,
    ):
        await run_fashn_tryon(
            settings,
            model_image="a",
            garment_image="b",
            category="auto",
            mode="balanced",
        )
    assert exc.value.code == "PROVIDER_JOB_FAILED"


@pytest.mark.asyncio
async def test_run_fashn_polls_until_completed() -> None:
    settings = Settings(fashn_api_key="k")
    post_resp = MagicMock()
    post_resp.status_code = 200
    post_resp.json = MagicMock(return_value={"id": "p1"})

    pending = MagicMock()
    pending.status_code = 200
    pending.json = MagicMock(return_value={"status": "processing"})

    done = MagicMock()
    done.status_code = 200
    done.json = MagicMock(
        return_value={"status": "completed", "output": ["https://cdn.fashn.ai/final.png"]}
    )

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=post_resp)
    mock_client.get = AsyncMock(side_effect=[pending, done])
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with (
        patch(
            "mirror.integrations.fashn_direct_tryon.httpx.AsyncClient",
            return_value=mock_client,
        ),
        patch(
            "mirror.integrations.fashn_direct_tryon.asyncio.sleep",
            new_callable=AsyncMock,
        ),
    ):
        out = await run_fashn_tryon(
            settings,
            model_image="a",
            garment_image="b",
            category="auto",
            mode="balanced",
        )
    assert fashn_output_image_url(out) == "https://cdn.fashn.ai/final.png"
    assert mock_client.get.await_count == 2

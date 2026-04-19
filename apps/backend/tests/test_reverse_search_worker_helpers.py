"""Unit tests for the reverse-search worker's pure helper functions.

(The full worker flow — claim, provider call, cache write, retry — is covered
by integration not included here; these are fast tests for the decision
logic.)
"""

from __future__ import annotations

import pytest

from mirror.workers.reverse_search_worker import (
    MAX_ATTEMPTS,
    _backoff_seconds,
    _is_near_duplicate,
    _is_transient,
)

# --- _is_transient ---------------------------------------------------------


@pytest.mark.parametrize(
    "code",
    [
        "SERPAPI_TIMEOUT",
        "SERPAPI_NETWORK_ERROR",
        "APIFY_TIMEOUT",
        "APIFY_NETWORK_ERROR",
        "PROVIDER_ERROR",
        "IMAGE_TOO_LARGE",
        "STORAGE_DOWNLOAD_FAILED",
        "INTERNAL",
    ],
)
def test_is_transient_true_for_retryable_codes(code: str) -> None:
    assert _is_transient(code) is True


@pytest.mark.parametrize(
    "code",
    [
        "SERPAPI_NOT_CONFIGURED",  # config — retry won't fix
        "SERPAPI_QUOTA_EXCEEDED",  # quota — retry won't fix
        "SERPAPI_BAD_RESPONSE",  # shape mismatch — retry won't fix
        "PROVIDER_NOT_CONFIGURED",
        "PROVIDER_CHANGED",
        "",
    ],
)
def test_is_transient_false_for_permanent_codes(code: str) -> None:
    assert _is_transient(code) is False


# --- _backoff_seconds ------------------------------------------------------


def test_backoff_has_5s_floor() -> None:
    assert _backoff_seconds(0) == 5.0
    assert _backoff_seconds(-1) == 5.0


def test_backoff_is_monotonic_and_exponential() -> None:
    # 0 → 5s, 1 → 5s (floor), 2 → 10s, 3 → 20s — geometric growth
    # on successive retry attempts.
    series = [_backoff_seconds(i) for i in range(5)]
    for a, b in zip(series, series[1:], strict=False):
        assert b >= a
    assert _backoff_seconds(2) == 10.0
    assert _backoff_seconds(3) == 20.0


def test_max_attempts_is_sane() -> None:
    # Regression guard: if MAX_ATTEMPTS drops to 1 the retry logic is a no-op.
    assert MAX_ATTEMPTS >= 2


# --- _is_near_duplicate ----------------------------------------------------


class _FakeHash:
    """Stand-in for imagehash.ImageHash — supports `-` → int Hamming distance."""

    def __init__(self, dist_to_ref: int) -> None:
        self._d = dist_to_ref

    def __sub__(self, other: "_FakeHash") -> int:  # noqa: UP037
        # Symmetric difference between two fakes — just subtract their
        # anchor distances. Good enough to simulate near/far comparisons.
        return abs(self._d - other._d)


def test_near_duplicate_detected_under_threshold() -> None:
    ref = _FakeHash(0)
    close = _FakeHash(3)  # 3 < threshold (6)
    assert _is_near_duplicate(close, [ref]) is True


def test_near_duplicate_rejects_over_threshold() -> None:
    ref = _FakeHash(0)
    far = _FakeHash(20)  # well beyond threshold
    assert _is_near_duplicate(far, [ref]) is False


def test_near_duplicate_none_hash_is_never_duplicate() -> None:
    ref = _FakeHash(0)
    assert _is_near_duplicate(None, [ref]) is False


def test_near_duplicate_empty_seen_is_never_duplicate() -> None:
    h = _FakeHash(0)
    assert _is_near_duplicate(h, []) is False


def test_near_duplicate_swallows_compare_errors() -> None:
    class BadHash:
        def __sub__(self, other: object) -> int:
            raise RuntimeError("broken")

    # Incompatible hash types shouldn't crash dedup — they just fail open
    # (treated as "not a duplicate"), keeping the match.
    assert _is_near_duplicate(BadHash(), [BadHash()]) is False

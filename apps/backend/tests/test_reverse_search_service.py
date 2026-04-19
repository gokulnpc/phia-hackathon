"""Unit tests for the reverse-search service helpers (cache + enqueue + poll)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from mirror.core.visual_search.service import (
    PROMPT_VERSION,
    enqueue_web_results_job,
    fetch_job,
    find_cached_web_results,
)

# --- Minimal Supabase client stub -----------------------------------------


class _FakeResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _QueryBuilder:
    """Chainable query stub that records filters and serves fixture rows."""

    def __init__(self, table: str, store: dict[str, list[dict[str, Any]]]) -> None:
        self._table = table
        self._store = store
        self._filters: dict[str, Any] = {}
        self._order: str | None = None
        self._limit: int | None = None
        self._insert_payload: dict[str, Any] | None = None
        self._select_cols: str | None = None

    # Selection / filtering chain -----------------------------------------
    def select(self, cols: str) -> _QueryBuilder:
        self._select_cols = cols
        return self

    def eq(self, col: str, val: Any) -> _QueryBuilder:
        self._filters[col] = ("eq", val)
        return self

    def is_(self, col: str, val: Any) -> _QueryBuilder:
        self._filters[col] = ("is", val)
        return self

    def in_(self, col: str, vals: list[Any]) -> _QueryBuilder:
        self._filters[col] = ("in", vals)
        return self

    def order(self, col: str, *, desc: bool = False) -> _QueryBuilder:
        self._order = f"{col}{':desc' if desc else ''}"
        return self

    def limit(self, n: int) -> _QueryBuilder:
        self._limit = n
        return self

    # Mutations -----------------------------------------------------------
    def insert(self, payload: dict[str, Any]) -> _QueryBuilder:
        self._insert_payload = dict(payload)
        return self

    # Execute -------------------------------------------------------------
    def execute(self) -> _FakeResult:
        if self._insert_payload is not None:
            row = dict(self._insert_payload)
            row.setdefault("id", f"id-{len(self._store.setdefault(self._table, []))}")
            self._store.setdefault(self._table, []).append(row)
            return _FakeResult([row])

        rows = list(self._store.get(self._table, []))
        for col, (op, val) in self._filters.items():
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "is" and val == "null":
                rows = [r for r in rows if r.get(col) in (None, "null")]
            elif op == "in":
                rows = [r for r in rows if r.get(col) in val]
        if self._order:
            field, _, direction = self._order.partition(":")
            rows.sort(
                key=lambda r: r.get(field) or "",
                reverse=direction == "desc",
            )
        if self._limit is not None:
            rows = rows[: self._limit]
        return _FakeResult(rows)


class FakeSupabase:
    def __init__(self) -> None:
        self.store: dict[str, list[dict[str, Any]]] = {
            "reverse_search_results": [],
            "reverse_search_jobs": [],
        }

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(name, self.store)


# --- Cache lookup ---------------------------------------------------------


def test_find_cached_web_results_empty() -> None:
    sb = FakeSupabase()
    got = find_cached_web_results(
        sb, canonical_url_hash="h1", provider="serpapi"
    )
    assert got is None


def test_find_cached_web_results_miss_when_web_results_empty() -> None:
    """Non-expired cache row with [] web_results must not block job enqueue."""
    sb = FakeSupabase()
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    sb.store["reverse_search_results"].append(
        {
            "id": "r-empty",
            "canonical_url_hash": "h1",
            "provider": "composite",
            "prompt_version": PROMPT_VERSION,
            "web_results": [],
            "fetched_at": datetime.now(UTC).isoformat(),
            "expires_at": future,
            "deleted_at": None,
        }
    )
    got = find_cached_web_results(
        sb, canonical_url_hash="h1", provider="composite"
    )
    assert got is None


def test_find_cached_web_results_returns_unexpired() -> None:
    sb = FakeSupabase()
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    sb.store["reverse_search_results"].append(
        {
            "id": "r1",
            "canonical_url_hash": "h1",
            "provider": "serpapi",
            "prompt_version": PROMPT_VERSION,
            "web_results": [{"image_url": "x"}],
            "fetched_at": datetime.now(UTC).isoformat(),
            "expires_at": future,
            "deleted_at": None,
        }
    )
    got = find_cached_web_results(
        sb, canonical_url_hash="h1", provider="serpapi"
    )
    assert got is not None
    assert got["web_results"] == [{"image_url": "x"}]


def test_find_cached_web_results_rejects_expired() -> None:
    sb = FakeSupabase()
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    sb.store["reverse_search_results"].append(
        {
            "id": "r1",
            "canonical_url_hash": "h1",
            "provider": "serpapi",
            "prompt_version": PROMPT_VERSION,
            "web_results": [],
            "fetched_at": past,
            "expires_at": past,
            "deleted_at": None,
        }
    )
    got = find_cached_web_results(
        sb, canonical_url_hash="h1", provider="serpapi"
    )
    assert got is None


# --- Enqueue --------------------------------------------------------------


def test_enqueue_web_results_job_inserts_and_returns_id() -> None:
    sb = FakeSupabase()
    # FakeSupabase defaults id to "id-<N>" (string); the helper validates it
    # parses as UUID, so provide a valid value via monkeypatching the row id.
    from unittest.mock import patch

    fake_uuid = "11111111-1111-1111-1111-111111111111"

    original = _QueryBuilder.execute

    def exec_with_uuid(self: _QueryBuilder) -> _FakeResult:
        if self._insert_payload is not None:
            row = dict(self._insert_payload)
            row.setdefault("id", fake_uuid)
            sb.store.setdefault(self._table, []).append(row)
            return _FakeResult([row])
        return original(self)

    with patch.object(_QueryBuilder, "execute", exec_with_uuid):
        jid = enqueue_web_results_job(
            sb,
            user_id="u1",
            product_id="prod1",
            canonical_url_hash="h1",
            provider="serpapi",
        )
    assert jid == fake_uuid
    assert len(sb.store["reverse_search_jobs"]) == 1
    saved = sb.store["reverse_search_jobs"][0]
    assert saved["canonical_url_hash"] == "h1"
    assert saved["provider"] == "serpapi"
    assert saved["prompt_version"] == PROMPT_VERSION


def test_enqueue_rejects_non_uuid_id() -> None:
    sb = FakeSupabase()  # default FakeSupabase returns "id-0" — not a UUID
    with pytest.raises(RuntimeError):
        enqueue_web_results_job(
            sb,
            user_id="u1",
            product_id=None,
            canonical_url_hash="h1",
            provider="mock",
        )


# --- Poll (fetch_job) -----------------------------------------------------


def test_fetch_job_returns_none_when_missing() -> None:
    sb = FakeSupabase()
    assert fetch_job(sb, user_id="u1", job_id="missing") is None


def test_fetch_job_inlines_result_when_completed() -> None:
    sb = FakeSupabase()
    sb.store["reverse_search_jobs"].append(
        {
            "id": "j1",
            "user_id": "u1",
            "status": "completed",
            "result_id": "r1",
            "error_code": None,
            "error_message": None,
        }
    )
    sb.store["reverse_search_results"].append(
        {"id": "r1", "web_results": [{"image_url": "x"}]}
    )
    out = fetch_job(sb, user_id="u1", job_id="j1")
    assert out is not None
    assert out["status"] == "completed"
    assert out["web_results"] == [{"image_url": "x"}]


def test_fetch_job_surfaces_failure_codes() -> None:
    sb = FakeSupabase()
    sb.store["reverse_search_jobs"].append(
        {
            "id": "j2",
            "user_id": "u1",
            "status": "failed",
            "result_id": None,
            "error_code": "SERPAPI_QUOTA_EXCEEDED",
            "error_message": "rate limited",
        }
    )
    out = fetch_job(sb, user_id="u1", job_id="j2")
    assert out is not None
    assert out["status"] == "failed"
    assert out["error_code"] == "SERPAPI_QUOTA_EXCEEDED"


def test_fetch_job_filters_by_user() -> None:
    sb = FakeSupabase()
    sb.store["reverse_search_jobs"].append(
        {
            "id": "j3",
            "user_id": "other",
            "status": "completed",
            "result_id": None,
            "error_code": None,
            "error_message": None,
        }
    )
    assert fetch_job(sb, user_id="u1", job_id="j3") is None

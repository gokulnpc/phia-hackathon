"""Revision-hash determinism: the closet_revision_hash is the cache key's linchpin."""

from __future__ import annotations

from mirror.core.fit_score.closet_snapshot import compute_revision_hash


def _item(cid: str, updated_at: str, v: int | None) -> dict[str, object]:
    return {"closet_item_id": cid, "updated_at": updated_at, "attributes_version": v}


def test_revision_hash_stable_under_reorder() -> None:
    a = [_item("a", "2026-04-18T10:00Z", 1), _item("b", "2026-04-18T11:00Z", 1)]
    b = [_item("b", "2026-04-18T11:00Z", 1), _item("a", "2026-04-18T10:00Z", 1)]
    assert compute_revision_hash(a) == compute_revision_hash(b)


def test_revision_hash_changes_on_updated_at() -> None:
    a = [_item("a", "2026-04-18T10:00Z", 1)]
    b = [_item("a", "2026-04-18T10:00:01Z", 1)]
    assert compute_revision_hash(a) != compute_revision_hash(b)


def test_revision_hash_changes_on_attributes_version_bump() -> None:
    a = [_item("a", "2026-04-18T10:00Z", 1)]
    b = [_item("a", "2026-04-18T10:00Z", 2)]
    assert compute_revision_hash(a) != compute_revision_hash(b)


def test_revision_hash_changes_on_item_add() -> None:
    a = [_item("a", "2026-04-18T10:00Z", 1)]
    b = [_item("a", "2026-04-18T10:00Z", 1), _item("b", "2026-04-18T11:00Z", 1)]
    assert compute_revision_hash(a) != compute_revision_hash(b)


def test_revision_hash_empty_is_stable() -> None:
    assert compute_revision_hash([]) == compute_revision_hash([])


def test_revision_hash_none_version_stable() -> None:
    # None should hash same as 0 (unenriched items shouldn't churn the hash).
    a = [_item("a", "2026-04-18T10:00Z", None)]
    b = [_item("a", "2026-04-18T10:00Z", None)]
    assert compute_revision_hash(a) == compute_revision_hash(b)

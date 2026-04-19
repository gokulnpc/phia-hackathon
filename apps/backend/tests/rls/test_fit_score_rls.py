"""RLS policy shape for fit_score tables.

These are SQL-text assertions (checking the policy rows we shipped) — the
end-to-end cross-user isolation check requires a real Supabase instance and
lives in the integration suite.
"""

from __future__ import annotations

from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[4]

MIGRATION_PATH = _REPO_ROOT / "supabase" / "migrations" / "20260420120000_fit_score.sql"
ENRICHMENT_MIGRATION_PATH = (
    _REPO_ROOT / "supabase" / "migrations" / "20260420115000_closet_enrichment.sql"
)


def test_fit_score_jobs_has_rls_enabled() -> None:
    sql = MIGRATION_PATH.read_text()
    assert "ALTER TABLE public.fit_score_jobs ENABLE ROW LEVEL SECURITY" in sql


def test_fit_score_jobs_has_user_scoped_select_policy() -> None:
    sql = MIGRATION_PATH.read_text()
    assert "users read own fit jobs" in sql
    assert "user_id = auth.uid" in sql


def test_fit_score_results_has_rls_enabled() -> None:
    sql = MIGRATION_PATH.read_text()
    assert "ALTER TABLE public.fit_score_results ENABLE ROW LEVEL SECURITY" in sql


def test_fit_score_results_filters_soft_deletes() -> None:
    sql = MIGRATION_PATH.read_text()
    assert "users read own fit results" in sql
    assert "deleted_at IS NULL" in sql


def test_cache_unique_index_includes_prompt_version() -> None:
    sql = MIGRATION_PATH.read_text()
    assert "idx_fit_results_cache_key" in sql
    assert "user_id, product_fingerprint, closet_revision_hash, prompt_version" in sql


def test_enrichment_jobs_has_rls_enabled() -> None:
    sql = ENRICHMENT_MIGRATION_PATH.read_text()
    assert "ALTER TABLE public.closet_enrichment_jobs ENABLE ROW LEVEL SECURITY" in sql


def test_enrichment_jobs_user_scoped_select() -> None:
    sql = ENRICHMENT_MIGRATION_PATH.read_text()
    assert "users read own enrichment jobs" in sql

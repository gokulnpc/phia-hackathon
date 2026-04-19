"""RLS tests run against a live Supabase instance (see docs/03).

Manual check after migration 20260417120000_tryon_results_rls_authenticated.sql:
signed-in user can soft-delete own tryon_results from My Closet (server action update).
"""

import pytest


@pytest.mark.skip(reason="Wire DATABASE_URL + supabase db reset for RLS CI")
def test_placeholder() -> None:
    assert True

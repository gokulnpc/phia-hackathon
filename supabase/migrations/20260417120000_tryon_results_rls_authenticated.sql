-- Closet soft-delete failed with "new row violates row-level security policy for table tryon_results"
-- when UPDATE WITH CHECK evaluated under a role where policies on PUBLIC interacted poorly with auth.uid().
-- Scope policies to authenticated; require active row for UPDATE USING.
DROP POLICY IF EXISTS "users read own results" ON public.tryon_results;
DROP POLICY IF EXISTS "users soft-delete own results" ON public.tryon_results;

CREATE POLICY "users read own results"
  ON public.tryon_results
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid ())
    AND deleted_at IS NULL
  );

CREATE POLICY "users soft-delete own results"
  ON public.tryon_results
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid ())
    AND deleted_at IS NULL
  )
  WITH CHECK (user_id = (select auth.uid ()));

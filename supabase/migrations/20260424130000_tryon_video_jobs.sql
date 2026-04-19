-- On-demand "Generate video" jobs (Veo 3.1) for the closet detail page.
--
-- Web client INSERTs into this table directly via the user's Supabase JWT
-- (RLS gates ownership). The mirror-tryon-video-worker claims with
-- SKIP LOCKED, runs Veo, uploads the MP4, and updates both this row and
-- `tryon_results.video_storage_path`. Realtime UPDATEs notify the client.

CREATE TABLE IF NOT EXISTS public.tryon_video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tryon_result_id UUID NOT NULL REFERENCES public.tryon_results (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  attempts SMALLINT NOT NULL DEFAULT 0,
  trace_id TEXT NOT NULL DEFAULT (gen_random_uuid ()::text),
  -- Optional per-job override; worker falls back to a sensible default.
  prompt TEXT,
  -- Populated on completion; mirror of `tryon_results.video_storage_path`.
  video_storage_path TEXT,
  error_code TEXT,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker queue scan.
CREATE INDEX IF NOT EXISTS idx_tryon_video_jobs_queue
  ON public.tryon_video_jobs (status, scheduled_at)
  WHERE status IN ('queued', 'processing');

-- User's history fetch (for "show prior video jobs" if we ever build that).
CREATE INDEX IF NOT EXISTS idx_tryon_video_jobs_user_time
  ON public.tryon_video_jobs (user_id, created_at DESC);

-- Prevent duplicate concurrent jobs per try-on (handles rapid double-clicks).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tryon_video_jobs_active_per_result
  ON public.tryon_video_jobs (tryon_result_id)
  WHERE status IN ('queued', 'processing');

ALTER TABLE public.tryon_video_jobs ENABLE ROW LEVEL SECURITY;

-- Drop-then-create makes re-running this migration a clean no-op.
-- (Postgres < 18 has no `CREATE POLICY IF NOT EXISTS`.)
DROP POLICY IF EXISTS "users insert own tryon video jobs" ON public.tryon_video_jobs;
CREATE POLICY "users insert own tryon video jobs"
  ON public.tryon_video_jobs FOR INSERT
  WITH CHECK (
    user_id = auth.uid ()
    AND EXISTS (
      SELECT 1
      FROM public.tryon_results r
      WHERE r.id = tryon_video_jobs.tryon_result_id
        AND r.user_id = auth.uid ()
        AND r.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "users read own tryon video jobs" ON public.tryon_video_jobs;
CREATE POLICY "users read own tryon video jobs"
  ON public.tryon_video_jobs FOR SELECT
  USING (user_id = auth.uid ());

-- Realtime publication: ALTER PUBLICATION ADD TABLE errors if the table
-- is already a member, so guard with a catalog check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tryon_video_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tryon_video_jobs;
  END IF;
END
$$;

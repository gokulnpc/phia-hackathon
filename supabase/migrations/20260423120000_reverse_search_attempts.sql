-- Reverse-search: retry-with-backoff support.
--
-- Before this migration, a single transient failure (SerpAPI 5xx, Apify
-- timeout, worker crash mid-job) permanently marked the job failed and the
-- only recovery was a client-side Retry which enqueues a brand-new row.
-- This adds an `attempts` counter so the worker can reschedule transient
-- failures up to N times with backoff before giving up.
--
-- Additive, no data migration needed: existing rows default to attempts=0
-- and behave exactly as before (no retry if the worker doesn't choose to).

ALTER TABLE public.reverse_search_jobs
  ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;

-- Speeds up the worker's cache-cleanup sweep that runs on startup.
CREATE INDEX IF NOT EXISTS idx_rs_results_sweep
  ON public.reverse_search_results (deleted_at, fetched_at)
  WHERE deleted_at IS NOT NULL;

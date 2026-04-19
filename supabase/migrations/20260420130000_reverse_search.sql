-- Reverse search ("Worn by"): async external-search pipeline.
--
-- Mirror-native results are served synchronously from the existing `posts`
-- table (see routers/reverse_search.py). External (SerpAPI Lens, ...) results
-- are fetched by `mirror-reverse-search-worker` and cached here keyed by
-- product identity + provider + prompt_version.
--
-- No user_id in the cache key: "same product → same external results" is
-- independent of which user asked. RLS still restricts *jobs* per-user.

CREATE TABLE public.reverse_search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  canonical_url_hash TEXT NOT NULL,
  provider TEXT NOT NULL,                          -- 'mock' | 'serpapi'
  prompt_version SMALLINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  priority SMALLINT NOT NULL DEFAULT 5,
  trace_id TEXT NOT NULL DEFAULT (gen_random_uuid ()::text),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  result_id UUID,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rs_jobs_queue
  ON public.reverse_search_jobs (status, priority, scheduled_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX idx_rs_jobs_user_time
  ON public.reverse_search_jobs (user_id, created_at DESC);

ALTER TABLE public.reverse_search_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own rs jobs"
  ON public.reverse_search_jobs FOR SELECT
  USING (user_id = auth.uid ());

CREATE TABLE public.reverse_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  job_id UUID REFERENCES public.reverse_search_jobs (id) ON DELETE SET NULL,
  canonical_url_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_version SMALLINT NOT NULL,
  web_results JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '6 hours'),
  deleted_at TIMESTAMPTZ
);

-- Natural cache key: same product + provider + prompt version → reuse.
-- Partial unique restricted to live (non-deleted) rows. The WHERE predicate
-- can't reference now() — Postgres requires IMMUTABLE functions in index
-- predicates (ERROR 42P17). Refresh semantics are handled in the worker:
-- before inserting a new result it soft-deletes any prior live row for the
-- same cache key, so the partial-unique constraint is satisfied.
CREATE UNIQUE INDEX idx_rs_results_cache_key
  ON public.reverse_search_results (canonical_url_hash, provider, prompt_version)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_rs_results_lookup
  ON public.reverse_search_results (canonical_url_hash, provider, prompt_version, expires_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.reverse_search_results ENABLE ROW LEVEL SECURITY;

-- Cached web results contain no user-identifying data. Any authenticated user
-- can read them — same product produces the same external photos regardless
-- of who requested the search.
CREATE POLICY "authenticated read rs results"
  ON public.reverse_search_results FOR SELECT
  USING (auth.role () = 'authenticated' AND deleted_at IS NULL);

ALTER TABLE public.reverse_search_jobs
  ADD CONSTRAINT reverse_search_jobs_result_fk
    FOREIGN KEY (result_id) REFERENCES public.reverse_search_results (id) ON DELETE SET NULL;

ALTER publication supabase_realtime ADD TABLE public.reverse_search_jobs;

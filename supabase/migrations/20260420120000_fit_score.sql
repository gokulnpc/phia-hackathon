-- Fit score: wardrobe-compatibility scoring between a candidate product and the
-- user's owned closet items. Async worker, Gemini 2.5 Flash with structured JSON
-- output, natural cache-hit detection via a three-part unique key.

CREATE TABLE public.fit_score_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  product_fingerprint TEXT NOT NULL,
  product_metadata JSONB NOT NULL DEFAULT '{}',
  closet_revision_hash TEXT NOT NULL,
  prompt_version SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  priority SMALLINT NOT NULL DEFAULT 5,
  trace_id TEXT NOT NULL DEFAULT (gen_random_uuid ()::text),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  result_id UUID,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fit_jobs_queue
  ON public.fit_score_jobs (status, priority, scheduled_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX idx_fit_jobs_user_time
  ON public.fit_score_jobs (user_id, created_at DESC);

ALTER TABLE public.fit_score_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own fit jobs"
  ON public.fit_score_jobs FOR SELECT
  USING (user_id = auth.uid ());

CREATE TABLE public.fit_score_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  job_id UUID NOT NULL REFERENCES public.fit_score_jobs (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  product_fingerprint TEXT NOT NULL,
  closet_revision_hash TEXT NOT NULL,
  prompt_version SMALLINT NOT NULL,
  overall_score SMALLINT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  breakdown JSONB NOT NULL,
  matching_items JSONB NOT NULL DEFAULT '[]',
  conflicts JSONB NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Natural cache key: same user + same product + same closet snapshot + same
-- prompt version reuses the prior result.
CREATE UNIQUE INDEX idx_fit_results_cache_key
  ON public.fit_score_results (user_id, product_fingerprint, closet_revision_hash, prompt_version)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_fit_results_user_time
  ON public.fit_score_results (user_id, generated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.fit_score_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own fit results"
  ON public.fit_score_results FOR SELECT
  USING (user_id = auth.uid () AND deleted_at IS NULL);

ALTER TABLE public.fit_score_jobs
  ADD CONSTRAINT fit_score_jobs_result_fk
    FOREIGN KEY (result_id) REFERENCES public.fit_score_results (id) ON DELETE SET NULL;

ALTER publication supabase_realtime ADD TABLE public.fit_score_jobs;

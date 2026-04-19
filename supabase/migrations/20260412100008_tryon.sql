CREATE TABLE public.tryon_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  product_image_url TEXT NOT NULL,
  product_image_hash TEXT NOT NULL,
  product_metadata JSONB NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'quality', 'fast')),
  reference_photo_id UUID NOT NULL REFERENCES public.reference_photos (id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  priority SMALLINT NOT NULL DEFAULT 5,
  provider TEXT,
  attempts SMALLINT NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  cost_cents INTEGER,
  trace_id TEXT NOT NULL DEFAULT gen_random_uuid ()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tryon_jobs_queue ON public.tryon_jobs (status, priority, scheduled_at)
WHERE
  status IN ('queued', 'processing');
CREATE INDEX idx_tryon_jobs_user_time ON public.tryon_jobs (user_id, created_at DESC);
CREATE INDEX idx_tryon_jobs_locked_at ON public.tryon_jobs (locked_at)
WHERE
  status = 'processing';

ALTER TABLE public.tryon_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own jobs"
  ON public.tryon_jobs FOR SELECT
  USING (user_id = auth.uid ());

CREATE TABLE public.tryon_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  job_id UUID NOT NULL REFERENCES public.tryon_jobs (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  product_image_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_storage_path TEXT NOT NULL,
  provider TEXT NOT NULL,
  quality_score REAL NOT NULL CHECK (
    quality_score >= 0
    AND quality_score <= 1
  ),
  quality_failure_mode TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_tryon_results_user_product ON public.tryon_results (user_id, product_image_hash)
WHERE
  deleted_at IS NULL;
CREATE INDEX idx_tryon_results_user_time ON public.tryon_results (user_id, generated_at DESC)
WHERE
  deleted_at IS NULL;

ALTER TABLE public.tryon_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own results"
  ON public.tryon_results FOR SELECT
  USING (
    user_id = auth.uid ()
    AND deleted_at IS NULL
  );

CREATE POLICY "users soft-delete own results"
  ON public.tryon_results FOR UPDATE
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

ALTER TABLE public.tryon_jobs
  ADD COLUMN result_id UUID REFERENCES public.tryon_results (id);

ALTER publication supabase_realtime ADD TABLE public.tryon_jobs;

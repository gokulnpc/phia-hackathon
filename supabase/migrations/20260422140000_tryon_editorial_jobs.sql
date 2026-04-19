-- Post–try-on Gemini editorial derivatives: optional second PNG per product (queue + worker).
-- Primary try-on rows keep UNIQUE (user_id, product_image_hash); derivatives reference the base row.

ALTER TABLE public.tryon_results
ADD COLUMN IF NOT EXISTS source_result_id UUID REFERENCES public.tryon_results (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tryon_results.source_result_id IS
  'When set, this row is a Gemini editorial derivative of the referenced base try-on result.';

DROP INDEX IF EXISTS idx_tryon_results_user_product;

CREATE UNIQUE INDEX idx_tryon_results_user_product_primary ON public.tryon_results (
  user_id,
  product_image_hash
)
WHERE
  deleted_at IS NULL
  AND source_result_id IS NULL;

CREATE TABLE public.tryon_editorial_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_tryon_result_id UUID NOT NULL REFERENCES public.tryon_results (id) ON DELETE CASCADE,
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
  output_tryon_result_id UUID REFERENCES public.tryon_results (id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_tryon_editorial_jobs_queue ON public.tryon_editorial_jobs (status, priority, scheduled_at)
WHERE
  status IN ('queued', 'processing');

CREATE INDEX idx_tryon_editorial_jobs_user_time ON public.tryon_editorial_jobs (user_id, created_at DESC);

ALTER TABLE public.tryon_editorial_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own tryon editorial jobs"
  ON public.tryon_editorial_jobs FOR SELECT
  USING (user_id = auth.uid ());

ALTER publication supabase_realtime ADD TABLE public.tryon_editorial_jobs;

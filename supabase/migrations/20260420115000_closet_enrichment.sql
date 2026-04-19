-- Closet-item attribute enrichment: Gemini Vision extracts structured fashion
-- attributes per owned item at save time, so the fit-score call later consumes
-- text rather than 20 signed image URLs.

ALTER TABLE public.closet_items
  ADD COLUMN IF NOT EXISTS attributes JSONB,
  ADD COLUMN IF NOT EXISTS attributes_version SMALLINT,
  ADD COLUMN IF NOT EXISTS attributes_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_closet_items_needs_enrichment
  ON public.closet_items (user_id, created_at)
  WHERE attributes IS NULL AND kind = 'owned';

CREATE TABLE public.closet_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  closet_item_id UUID NOT NULL REFERENCES public.closet_items (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed')
  ),
  priority SMALLINT NOT NULL DEFAULT 7,
  attempts SMALLINT NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  trace_id TEXT NOT NULL DEFAULT (gen_random_uuid ()::text),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_closet_enrichment_jobs_queue
  ON public.closet_enrichment_jobs (status, priority, scheduled_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX idx_closet_enrichment_jobs_user_time
  ON public.closet_enrichment_jobs (user_id, created_at DESC);

ALTER TABLE public.closet_enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own enrichment jobs"
  ON public.closet_enrichment_jobs FOR SELECT
  USING (user_id = auth.uid ());

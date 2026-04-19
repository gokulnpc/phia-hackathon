-- Async avatar preprocessing (Gemini) after reference photo upload.

ALTER TABLE public.reference_photos
ADD COLUMN IF NOT EXISTS source_storage_paths TEXT[];

CREATE TABLE public.avatar_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reference_photo_id UUID NOT NULL REFERENCES public.reference_photos (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed')
  ),
  attempts SMALLINT NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  trace_id TEXT NOT NULL DEFAULT (gen_random_uuid ()::text),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avatar_generation_jobs_queue ON public.avatar_generation_jobs (status, scheduled_at)
WHERE
  status = 'queued';

CREATE INDEX idx_avatar_generation_jobs_user_time ON public.avatar_generation_jobs (user_id, created_at DESC);

ALTER TABLE public.avatar_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own avatar jobs"
  ON public.avatar_generation_jobs FOR SELECT
  USING (user_id = auth.uid ());

CREATE TABLE public.reference_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  file_size_bytes INTEGER NOT NULL,
  face_detected BOOLEAN NOT NULL,
  body_detected BOOLEAN NOT NULL,
  quality_score REAL NOT NULL CHECK (
    quality_score >= 0
    AND quality_score <= 1
  ),
  preprocessed_storage_path TEXT,
  preprocessed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted', 'pending_review')),
  consent_id UUID NOT NULL REFERENCES public.biometric_consents (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, version)
);

CREATE INDEX idx_reference_photos_user_active ON public.reference_photos (user_id)
WHERE
  status = 'active'
  AND deleted_at IS NULL;

ALTER TABLE public.reference_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own photos"
  ON public.reference_photos FOR SELECT
  USING (user_id = auth.uid ());

CREATE POLICY "users insert own photos"
  ON public.reference_photos FOR INSERT
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users update own photos"
  ON public.reference_photos FOR UPDATE
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

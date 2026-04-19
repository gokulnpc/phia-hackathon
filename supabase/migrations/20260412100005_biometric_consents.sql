CREATE TABLE public.biometric_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  consent_text_hash TEXT NOT NULL,
  scope TEXT[] NOT NULL,
  ip_address inet,
  user_agent TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_biometric_consents_user_active ON public.biometric_consents (user_id, granted_at DESC)
WHERE
  revoked_at IS NULL;

ALTER TABLE public.biometric_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own consents"
  ON public.biometric_consents FOR SELECT
  USING (user_id = auth.uid ());

CREATE POLICY "users insert own consents"
  ON public.biometric_consents FOR INSERT
  WITH CHECK (user_id = auth.uid ());

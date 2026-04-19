INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-photos', 'reference-photos', FALSE),
  ('tryon-results', 'tryon-results', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "reference photos read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reference-photos'
    AND split_part(name, '/', 1) = auth.uid ()::text
  );

CREATE POLICY "reference photos insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reference-photos'
    AND split_part(name, '/', 1) = auth.uid ()::text
  );

CREATE POLICY "reference photos update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reference-photos'
    AND split_part(name, '/', 1) = auth.uid ()::text
  );

CREATE POLICY "tryon results read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tryon-results'
    AND split_part(name, '/', 1) = auth.uid ()::text
  );

-- Per-try-on Veo 3.1 video clip.
--
-- Demo-grade: a single MP4 stored alongside the still image in the
-- existing `tryon-results` bucket (under a `videos/` prefix). No new
-- bucket needed — same RLS, same auth model.
--
-- Async generation is out-of-scope for this migration; the seeder script
-- writes the path directly. A follow-up worker can populate this column
-- on demand later.

ALTER TABLE public.tryon_results
  ADD COLUMN IF NOT EXISTS video_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS video_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tryon_results_with_video
  ON public.tryon_results (id)
  WHERE video_storage_path IS NOT NULL;

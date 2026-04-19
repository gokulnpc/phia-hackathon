-- Optional prior try-on result used as the "model" image for the next virtual try-on (extension flow).
ALTER TABLE public.tryon_jobs
ADD COLUMN model_reference_tryon_result_id UUID REFERENCES public.tryon_results (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tryon_jobs.model_reference_tryon_result_id IS 'When set, the worker uses this completed try-on result image as the model input (after 3:4 fit) instead of the active reference photo.';

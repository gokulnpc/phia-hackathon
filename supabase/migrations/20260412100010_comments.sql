CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  post_id UUID NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.comments (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  mentions UUID[] NOT NULL DEFAULT '{}',
  moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_comments_post_time ON public.comments (post_id, created_at)
WHERE
  deleted_at IS NULL;

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

CREATE OR REPLACE FUNCTION public.update_post_comment_count ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET
      comment_count = comment_count + 1
    WHERE
      id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET
      comment_count = greatest(0, comment_count - 1)
    WHERE
      id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.posts
    SET
      comment_count = greatest(0, comment_count - 1)
    WHERE
      id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER comments_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_comment_count ();

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments visible on visible posts"
  ON public.comments FOR SELECT
  USING (
    deleted_at IS NULL
    AND moderation_status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE
        id = comments.post_id
    )
  );

CREATE POLICY "users create own comments"
  ON public.comments FOR INSERT
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users update own comments"
  ON public.comments FOR UPDATE
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

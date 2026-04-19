CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tryon_result_id UUID REFERENCES public.tryon_results (id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  caption TEXT CHECK (length(caption) <= 280),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'close_friends', 'private')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'rejected')),
  moderation_score JSONB,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_posts_user_time ON public.posts (user_id, created_at DESC)
WHERE
  deleted_at IS NULL;
CREATE INDEX idx_posts_public_feed ON public.posts (created_at DESC)
WHERE
  visibility = 'public'
  AND moderation_status = 'approved'
  AND deleted_at IS NULL;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public posts visible to all"
  ON public.posts FOR SELECT
  USING (
    visibility = 'public'
    AND moderation_status = 'approved'
    AND deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocks
      WHERE
        blocker_id = posts.user_id
        AND blocked_id = auth.uid ()
    )
  );

CREATE POLICY "follower posts visible to followers"
  ON public.posts FOR SELECT
  USING (
    visibility = 'followers'
    AND moderation_status = 'approved'
    AND deleted_at IS NULL
    AND public.follows_user (user_id)
  );

CREATE POLICY "close friend posts visible to close friends"
  ON public.posts FOR SELECT
  USING (
    visibility = 'close_friends'
    AND moderation_status = 'approved'
    AND deleted_at IS NULL
    AND public.is_close_friend_of (user_id)
  );

CREATE POLICY "own posts always visible to self"
  ON public.posts FOR SELECT
  USING (user_id = auth.uid ());

CREATE POLICY "users create own posts"
  ON public.posts FOR INSERT
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users update own posts"
  ON public.posts FOR UPDATE
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  post_id UUID NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'fire' CHECK (reaction_type = 'fire'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, reaction_type)
);

CREATE INDEX idx_reactions_post ON public.reactions (post_id, created_at DESC);
CREATE INDEX idx_reactions_user ON public.reactions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_post_reaction_count ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET
      reaction_count = reaction_count + 1
    WHERE
      id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET
      reaction_count = greatest(0, reaction_count - 1)
    WHERE
      id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER reactions_count_trigger
  AFTER INSERT OR DELETE ON public.reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_reaction_count ();

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions visible on visible posts"
  ON public.reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts
      WHERE
        id = reactions.post_id
    )
  );

CREATE POLICY "users create own reactions"
  ON public.reactions FOR INSERT
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users delete own reactions"
  ON public.reactions FOR DELETE
  USING (user_id = auth.uid ());

ALTER publication supabase_realtime ADD TABLE public.posts;

ALTER publication supabase_realtime ADD TABLE public.reactions;

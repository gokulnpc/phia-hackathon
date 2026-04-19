-- follows, close_friends, blocks (docs §6)

CREATE TABLE public.follows (
  follower_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);

CREATE INDEX idx_follows_followee ON public.follows (followee_id, created_at DESC);
CREATE INDEX idx_follows_follower ON public.follows (follower_id, created_at DESC);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows readable by both parties"
  ON public.follows FOR SELECT
  USING (follower_id = auth.uid () OR followee_id = auth.uid ());

CREATE POLICY "users create own follows"
  ON public.follows FOR INSERT
  WITH CHECK (follower_id = auth.uid ());

CREATE POLICY "users delete own follows"
  ON public.follows FOR DELETE
  USING (follower_id = auth.uid ());

CREATE TABLE public.close_friends (
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id),
  CHECK (owner_id != friend_id)
);

CREATE INDEX idx_close_friends_friend ON public.close_friends (friend_id);

ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own close friends"
  ON public.close_friends FOR ALL
  USING (owner_id = auth.uid ())
  WITH CHECK (owner_id = auth.uid ());

CREATE POLICY "friends can see they are in a close-friends list"
  ON public.close_friends FOR SELECT
  USING (friend_id = auth.uid ());

CREATE TABLE public.blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own blocks"
  ON public.blocks FOR ALL
  USING (blocker_id = auth.uid ())
  WITH CHECK (blocker_id = auth.uid ());

CREATE OR REPLACE FUNCTION public.follows_user (followee UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.follows
    WHERE follower_id = auth.uid ()
      AND followee_id = followee
  );
$$;

CREATE OR REPLACE FUNCTION public.is_close_friend_of (owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.close_friends
    WHERE owner_id = owner
      AND friend_id = auth.uid ()
  );
$$;

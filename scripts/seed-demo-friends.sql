-- H12 demo seed — replace UUIDs before running in Supabase SQL Editor.
-- Get IDs from Authentication → Users. Use a signed try-on image URL or any HTTPS image for image_url.

-- Main demo account (the one you log in with on stage)
-- DEMO_USER_UUID = '...'

-- Friend accounts
-- FRIEND_A_UUID = '...'
-- FRIEND_B_UUID = '...'
-- SARAH_UUID = '...'

INSERT INTO public.posts (
  id,
  user_id,
  image_url,
  caption,
  visibility,
  moderation_status,
  reaction_count
)
VALUES
  (
    gen_random_uuid (),
    'REPLACE_ME_FRIEND_A'::uuid,
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
    'Seeded fit — friend A',
    'public',
    'approved',
    0
  ),
  (
    gen_random_uuid (),
    'REPLACE_ME_FRIEND_B'::uuid,
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600',
    'Seeded fit — friend B',
    'public',
    'approved',
    1
  ),
  (
    gen_random_uuid (),
    'REPLACE_ME_SARAH'::uuid,
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600',
    'Sarah''s pre-made post',
    'public',
    'approved',
    2
  );

-- Link Sarah’s reaction on friend A’s post (replace POST_ID after inserting posts, or use subselect)
-- Example: add reaction from Sarah to the first seeded post by friend A
/*
INSERT INTO public.reactions (post_id, user_id, reaction_type)
SELECT id, 'REPLACE_ME_SARAH'::uuid, 'fire'
FROM public.posts
WHERE user_id = 'REPLACE_ME_FRIEND_A'::uuid
ORDER BY created_at DESC
LIMIT 1
ON CONFLICT DO NOTHING;
*/

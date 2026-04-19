CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_image_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  sizes JSONB NOT NULL DEFAULT '{}',
  fit_preferences JSONB NOT NULL DEFAULT '{}',
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  discoverable_by TEXT NOT NULL DEFAULT 'anyone' CHECK (discoverable_by IN ('anyone', 'handle', 'nobody')),
  style_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_username ON public.profiles (username);
CREATE INDEX idx_profiles_display_name_trgm ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

CREATE OR REPLACE FUNCTION public.is_admin ()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = auth.uid ()
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text := lower(regexp_replace(coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'username'), ''), ''), '[^a-z0-9_]', '', 'g'));
  chosen_username text;
BEGIN
  IF length(base_username) BETWEEN 3 AND 24 AND base_username ~ '^[a-z0-9_]{3,24}$' THEN
    chosen_username := base_username;
  ELSE
    chosen_username := 'u' || substr(md5(NEW.id::text), 1, 11);
  END IF;
  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (
    NEW.id,
    chosen_username,
    coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), 'New User')
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    INSERT INTO public.profiles (user_id, username, display_name)
    VALUES (NEW.id, 'u' || substr(md5(NEW.id::text || random()::text), 1, 11), coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), 'New User'));
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_for_new_user ();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles are readable by anyone (public visibility)"
  ON public.profiles FOR SELECT
  USING (
    visibility = 'public'
    OR user_id = auth.uid ()
    OR (
      visibility = 'followers'
      AND public.follows_user (user_id)
    )
  );

CREATE POLICY "users update own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

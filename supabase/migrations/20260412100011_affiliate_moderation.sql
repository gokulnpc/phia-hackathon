CREATE TABLE public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  tryon_result_id UUID REFERENCES public.tryon_results (id) ON DELETE SET NULL,
  original_url TEXT NOT NULL,
  wrapped_url TEXT NOT NULL,
  provider TEXT NOT NULL,
  context TEXT,
  commission_cents INTEGER,
  commission_status TEXT CHECK (commission_status IN ('pending', 'approved', 'paid', 'void')),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  commission_recorded_at TIMESTAMPTZ
);

CREATE INDEX idx_affiliate_clicks_user_time ON public.affiliate_clicks (user_id, clicked_at DESC);
CREATE INDEX idx_affiliate_clicks_commission_pending ON public.affiliate_clicks (commission_status)
WHERE
  commission_status = 'pending';

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own clicks"
  ON public.affiliate_clicks FOR SELECT
  USING (user_id = auth.uid ());

CREATE TABLE public.moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment', 'profile')),
  content_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  flag_reason TEXT,
  flag_score JSONB,
  flagged_by UUID REFERENCES auth.users (id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
  reviewed_by UUID REFERENCES auth.users (id),
  reviewed_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_pending ON public.moderation_queue (created_at)
WHERE
  status = 'pending';

ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins see queue"
  ON public.moderation_queue FOR SELECT
  USING (public.is_admin ());

CREATE POLICY "admins update queue"
  ON public.moderation_queue FOR UPDATE
  USING (public.is_admin ())
  WITH CHECK (public.is_admin ());

CREATE TABLE public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  reporter_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES auth.users (id),
  content_type TEXT CHECK (content_type IN ('post', 'comment', 'profile')),
  content_id UUID,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_user_reports_open ON public.user_reports (created_at)
WHERE
  status = 'open';

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users create reports"
  ON public.user_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid ());

CREATE POLICY "users see own reports"
  ON public.user_reports FOR SELECT
  USING (reporter_id = auth.uid () OR public.is_admin ());

CREATE POLICY "admins update reports"
  ON public.user_reports FOR UPDATE
  USING (public.is_admin ());

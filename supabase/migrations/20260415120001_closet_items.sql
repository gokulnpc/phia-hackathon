CREATE TABLE public.closet_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  tryon_result_id UUID REFERENCES public.tryon_results (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tried_on', 'owned', 'wishlist')),
  notes TEXT,
  purchase_price_usd NUMERIC(10, 2),
  purchase_date DATE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_closet_user_kind ON public.closet_items (user_id, kind, created_at DESC);

CREATE UNIQUE INDEX idx_closet_wishlist_user_product ON public.closet_items (user_id, product_id)
WHERE
  kind = 'wishlist'
  AND product_id IS NOT NULL;

CREATE TRIGGER closet_items_updated_at
  BEFORE UPDATE ON public.closet_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

ALTER TABLE public.closet_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users access own closet"
  ON public.closet_items
  FOR ALL
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

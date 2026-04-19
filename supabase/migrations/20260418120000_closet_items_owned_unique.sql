-- One owned row per user per product (mirrors wishlist partial unique index).
CREATE UNIQUE INDEX idx_closet_owned_user_product ON public.closet_items (user_id, product_id)
WHERE
  kind = 'owned'
  AND product_id IS NOT NULL;

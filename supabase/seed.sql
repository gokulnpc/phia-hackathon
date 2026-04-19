-- Dev seed: retailer detection rules (Hackathon Cut H7 / H12). Run with `supabase db seed` or after reset.

DELETE FROM public.product_detection_rules
WHERE domain IN (
  'nike.com', 'zara.com', 'hm.com', 'uniqlo.com', 'nordstrom.com',
  'therealreal.com', 'thredup.com', 'net-a-porter.com', 'farfetch.com', 'lululemon.com',
  'amazon.com'
);

INSERT INTO public.product_detection_rules (domain, priority, selector_config, confidence, active)
VALUES
  ('nike.com', 10, '{"image":"meta[property=\"og:image\"]","name":"meta[property=\"og:title\"]","price":"[data-test=product-price]"}', 0.95, true),
  ('zara.com', 10, '{"image":"picture.media-image img, meta[property=\"og:image\"]","name":"h1[data-qa-qualifier=\"product-detail-info-header\"], h1.product-detail-info__header-name","price":".money-amount__main, [data-qa-qualifier=\"price-current\"]"}', 0.85, true),
  ('hm.com', 10, '{"image":"meta[property=\"og:image\"]","name":"meta[property=\"og:title\"]","price":"[data-testid=price]"}', 0.85, true),
  ('uniqlo.com', 10, '{"image":"meta[property=\"og:image\"]","name":"h1","price":".pdp-price"}', 0.85, true),
  ('nordstrom.com', 10, '{"image":"meta[property=\"og:image\"]","name":"h1","price":"#price-line"}', 0.85, true),
  ('therealreal.com', 10, '{"image":"meta[property=\"og:image\"]","name":"h1","price":".price"}', 0.8, true),
  ('thredup.com', 10, '{"image":".product-images__main img","name":"h1.product-name","price":".price"}', 0.85, true),
  ('net-a-porter.com', 10, '{"image":"meta[property=\"og:image\"]","name":"h1","price":"[itemprop=price]"}', 0.85, true),
  ('farfetch.com', 10, '{"image":"meta[property=\"og:image\"]","name":"h1","price":"[data-component=PriceFinalLarge]"}', 0.85, true),
  ('lululemon.com', 10, '{"image":"meta[property=\"og:image\"]","name":"h1","price":"[data-testid=product-price]"}', 0.9, true),
  -- Amazon: markup changes; JSON-LD + OG are primary; DOM selectors are best-effort.
  ('amazon.com', 10, '{"image":"meta[property=\"og:image\"]","name":"#productTitle","price":"#corePrice_feature_div .a-price .a-offscreen"}', 0.75, true);

-- Zara PDP: titles are often category landing strings; DOM + selectors recover product name + hero image.
INSERT INTO public.product_detection_rules (domain, priority, selector_config, confidence, active)
SELECT
  'zara.com',
  10,
  '{"image":"picture.media-image img, meta[property=\"og:image\"]","name":"h1[data-qa-qualifier=\"product-detail-info-header\"], h1.product-detail-info__header-name","price":".money-amount__main, [data-qa-qualifier=\"price-current\"]"}'::jsonb,
  0.85,
  true
WHERE
  NOT EXISTS (
    SELECT 1
    FROM public.product_detection_rules
    WHERE
      domain = 'zara.com'
      AND priority = 10
  );

-- H7: amazon.com PDP fallbacks (JSON-LD is primary; Amazon markup changes often).
INSERT INTO public.product_detection_rules (domain, priority, selector_config, confidence, active)
SELECT
  'amazon.com',
  10,
  '{"image":"meta[property=\"og:image\"]","name":"#productTitle","price":"#corePrice_feature_div .a-price .a-offscreen"}'::jsonb,
  0.75,
  true
WHERE
  NOT EXISTS (
    SELECT 1
    FROM public.product_detection_rules
    WHERE
      domain = 'amazon.com'
      AND priority = 10
  );

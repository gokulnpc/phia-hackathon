CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  canonical_url TEXT NOT NULL,
  canonical_url_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT CHECK (
    category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory', 'other')
  ),
  description TEXT,
  primary_image_url TEXT NOT NULL,
  additional_image_urls TEXT[] NOT NULL DEFAULT '{}',
  price_usd NUMERIC(10, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  sku TEXT,
  color TEXT,
  fingerprint TEXT NOT NULL,
  retailers JSONB NOT NULL DEFAULT '[]',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_fingerprint ON public.products (fingerprint);
CREATE INDEX idx_products_brand ON public.products (brand)
WHERE
  brand IS NOT NULL;
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products readable by all authenticated users"
  ON public.products FOR SELECT
  USING (auth.role () = 'authenticated');

CREATE TABLE public.product_detection_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  domain TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  selector_config JSONB NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  last_verified_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_detection_rules_domain ON public.product_detection_rules (domain, priority)
WHERE
  active = true;

CREATE TRIGGER product_detection_rules_updated_at
  BEFORE UPDATE ON public.product_detection_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

ALTER TABLE public.product_detection_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules readable by all authenticated users"
  ON public.product_detection_rules FOR SELECT
  USING (
    auth.role () = 'authenticated'
    AND active = true
  );

CREATE TABLE public.price_intelligence_cache (
  product_url_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  result JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (product_url_hash, provider)
);

CREATE INDEX idx_price_cache_expires ON public.price_intelligence_cache (expires_at);

CREATE TABLE public.provider_health_snapshots (
  provider TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  p50_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  PRIMARY KEY (provider, window_start)
);

CREATE INDEX idx_provider_health_recent ON public.provider_health_snapshots (provider, window_start DESC);

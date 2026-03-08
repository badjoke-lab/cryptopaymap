CREATE TABLE IF NOT EXISTS public.stats_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stats_cache_as_of_idx
  ON public.stats_cache (as_of DESC);

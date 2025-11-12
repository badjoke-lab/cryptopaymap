-- CryptoPayMap Phase 1 schema
BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geom GEOGRAPHY(Point, 4326),
  about TEXT,
  payment_note TEXT,
  amenities TEXT[],
  amenities_notes TEXT,
  accepted TEXT[],
  preferred TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  flags JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS verifications (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('owner','community','directory','unverified')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','rejected','pending')),
  submitted_by TEXT,
  reviewed_by TEXT,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  asset TEXT,
  chain TEXT,
  address TEXT,
  qr_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_accepts (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  chain TEXT,
  is_preferred BOOLEAN DEFAULT FALSE,
  UNIQUE (place_id, asset, chain)
);

CREATE TABLE IF NOT EXISTS socials (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  platform TEXT,
  url TEXT,
  handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('cover','gallery')),
  url TEXT,
  caption TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS amenities (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  amenity TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  place_id TEXT REFERENCES places(id) ON DELETE CASCADE,
  action TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_places_geom ON places USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_places_country_city ON places (country, city);
CREATE INDEX IF NOT EXISTS idx_verifications_place_id ON verifications (place_id);
CREATE INDEX IF NOT EXISTS idx_payments_place_id ON payments (place_id);
CREATE INDEX IF NOT EXISTS idx_payment_accepts_place_id ON payment_accepts (place_id);
CREATE INDEX IF NOT EXISTS idx_socials_place_id ON socials (place_id);
CREATE INDEX IF NOT EXISTS idx_media_place_id ON media (place_id);
CREATE INDEX IF NOT EXISTS idx_amenities_place_id ON amenities (place_id);
CREATE INDEX IF NOT EXISTS idx_history_place_id ON history (place_id);

COMMIT;

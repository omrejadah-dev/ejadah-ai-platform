-- 001_schema.sql — market schema: raw deals, reference tables, cleaned deals
-- Run: docker exec -i ejadah-ai-postgres psql -U ejadah -d ejadah_ai -v ON_ERROR_STOP=1 -f /dev/stdin < db/migrations/001_schema.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS market;

-- ---------------------------------------------------------------------------
-- Raw rows exactly as they appear in the 17 Excel files (via all_deals.csv)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market.deals_raw (
  source_file   text,
  deal_id       text,
  category      text,
  type_raw      text,
  price         text,
  area          text,
  ppm_source    text,
  deal_date     text,
  region        text,
  city          text,
  district      text,
  plan_raw      text,
  plot_raw      text,
  notes         text,
  source        text,
  type_ai       text
);

-- ---------------------------------------------------------------------------
-- Arabic normalisation: alef variants, taa marbuta, alef maqsura, tatweel,
-- diacritics, Arabic-Indic digits, repeated whitespace.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION market.normalize_ar(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        translate(
          regexp_replace(
            regexp_replace(
              regexp_replace(translate(coalesce(t, ''), '$|', '//'), '\s*/\s*[0-9٠-٩]+\s*$', ''),  -- drop sub-district suffix "/ 2"
              '^\s*ح[يى]\s+', ''),                                                              -- drop leading "حي "
            '[\u064B-\u0652\u0640]', '', 'g'),                                                   -- diacritics + tatweel
          'أإآٱةىئؤ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          'اااا' || 'ه' || 'ي' || 'ي' || 'و' || '01234567890123456789'
        ),
        '[\s\-_/\.,،]+', ' ', 'g'),                                                            -- punctuation → space
      '^\s+|\s+$', '', 'g'),
  '');
$$;

-- Plan / plot numbers: keep only letters and digits, Arabic-Indic digits → ASCII,
-- so "ق / ب / 5768", "888/ق/ب" and "ق/ ب/ 2160" collapse to comparable keys.
CREATE OR REPLACE FUNCTION market.normalize_code(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(
    regexp_replace(
      translate(coalesce(t, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹أإآةى', '01234567890123456789ااا' || 'ه' || 'ي'),
      '[^0-9A-Za-zء-ي]+', '', 'g'),
  '');
$$;

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market.cities (
  id         serial PRIMARY KEY,
  region     text NOT NULL,
  name       text NOT NULL,
  name_norm  text NOT NULL,
  enabled    boolean NOT NULL DEFAULT false,   -- shown in the UI (Jeddah + Riyadh at launch)
  UNIQUE (region, name_norm)
);

CREATE TABLE IF NOT EXISTS market.districts (
  id         serial PRIMARY KEY,
  city_id    int NOT NULL REFERENCES market.cities(id),
  name       text NOT NULL,                     -- display name (most frequent raw spelling)
  name_norm  text NOT NULL,
  is_unknown boolean NOT NULL DEFAULT false,    -- أخرى / بدون / خارج حدود الاحياء
  UNIQUE (city_id, name_norm)
);

CREATE TABLE IF NOT EXISTS market.district_aliases (
  city_id     int NOT NULL REFERENCES market.cities(id),
  raw_name    text NOT NULL,
  district_id int NOT NULL REFERENCES market.districts(id),
  PRIMARY KEY (city_id, raw_name)
);

CREATE TABLE IF NOT EXISTS market.district_adjacency (
  district_id  int NOT NULL REFERENCES market.districts(id),
  neighbor_id  int NOT NULL REFERENCES market.districts(id),
  PRIMARY KEY (district_id, neighbor_id)
);

-- Maps the 52 raw type values onto the 4 product types (NULL group = not priced)
CREATE TABLE IF NOT EXISTS market.type_mapping (
  type_raw   text PRIMARY KEY,
  type_group text CHECK (type_group IN ('land','villa','apartment','building'))
);
INSERT INTO market.type_mapping (type_raw, type_group) VALUES
  ('قطعة أرض','land'), ('أرض فضاء','land'), ('أرض مسورة','land'),
  ('فيلا','villa'), ('بيت','villa'), ('قصر','villa'),
  ('شقة','apartment'), ('شقة سكني','apartment'), ('وحدة سكنية','apartment'), ('وحدة عقارية','apartment'), ('دور','apartment'),
  ('عمارة','building'), ('مبنى سكني','building'), ('مبنى سكني/تجاري','building'), ('مجمع سكني','building'), ('مبنى','building')
ON CONFLICT (type_raw) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Cleaned deals: the only table the pricing engine reads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market.deals (
  deal_id          text PRIMARY KEY,
  category         text,
  type_raw         text,
  type_group       text,
  price            numeric(16,2),
  area_m2          numeric(14,2),
  ppm              numeric(14,2),               -- recomputed = price / area
  ppm_source       numeric(14,2),
  deal_date        date NOT NULL,
  year_month       date NOT NULL,               -- first day of month
  region           text,
  city_id          int REFERENCES market.cities(id),
  district_id      int REFERENCES market.districts(id),
  district_raw     text,
  plan_raw         text,
  plan_norm        text,
  plot_raw         text,
  plot_norm        text,
  notes            text,
  source           text,
  is_market_deal   boolean NOT NULL DEFAULT false,
  exclusion_reason text                          -- NULL when is_market_deal
);

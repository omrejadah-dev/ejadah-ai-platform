-- 012_adjustments.sql — property-specific adjustments on top of the market price (decisions in PLAN.md section 1)
-- The Ministry of Justice deals carry no age, floors or features, so their effect is a table of percentages that
-- Ejadah sets from the admin panel. Every rule starts at 0% (no effect) until Ejadah supplies the values.
--   final = market price x (1 + sum of rule percentages, capped) x (1 + AI adjustment from the free-text notes, capped)

CREATE TABLE IF NOT EXISTS app.adjustment_rules (
  id           serial PRIMARY KEY,
  type_group   text NOT NULL CHECK (type_group IN ('villa','apartment','building')),
  factor       text NOT NULL,             -- age | floors | a feature key from EstimateRequest.AllowedFeatures
  label_ar     text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('per_year','per_floor','flag')),
  pct          numeric(6,2) NOT NULL DEFAULT 0,   -- per_year: % per year of age; per_floor: % per floor above the first; flag: % when present
  max_abs_pct  numeric(6,2),                      -- cap for per_year / per_floor rules
  enabled      boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  UNIQUE (type_group, factor)
);

INSERT INTO app.adjustment_rules (type_group, factor, label_ar, kind, max_abs_pct)
SELECT t, f.factor, f.label_ar, f.kind, f.cap
FROM unnest(ARRAY['villa','apartment','building']) t,
     (VALUES ('age',             'عمر العقار',     'per_year',  30.0),
             ('floors',          'عدد الأدوار',    'per_floor', 20.0),
             ('elevator',        'مصعد',           'flag',      NULL),
             ('garden',          'حديقة',          'flag',      NULL),
             ('pool',            'مسبح',           'flag',      NULL),
             ('annex',           'ملحق',           'flag',      NULL),
             ('covered_parking', 'مواقف مغطاة',    'flag',      NULL),
             ('central_ac',      'تكييف مركزي',    'flag',      NULL)) f(factor, label_ar, kind, cap)
WHERE NOT (f.factor = 'floors' AND t = 'apartment')        -- floors applies to villa and building only (EstimateRequest)
ON CONFLICT (type_group, factor) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.pricing_settings (
  key         text PRIMARY KEY,
  value       numeric(6,2) NOT NULL,
  label_ar    text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
INSERT INTO app.pricing_settings (key, value, label_ar) VALUES
  ('rules_max_total_pct', 30, 'الحد الأقصى لمجموع تعديلات العمر والمميزات (±%)'),
  ('ai_max_pct',          15, 'الحد الأقصى لتعديل الذكاء الاصطناعي من المعلومات الإضافية (±%)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app.valuations ADD COLUMN IF NOT EXISTS adjustments jsonb;   -- the breakdown shown under the price

SELECT type_group, count(*) AS rules FROM app.adjustment_rules GROUP BY 1 ORDER BY 1;

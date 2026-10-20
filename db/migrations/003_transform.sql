-- 003_transform.sql — build reference tables and the cleaned market.deals from market.deals_raw
-- Idempotent: safe to re-run after a new raw load.

TRUNCATE market.deals;
TRUNCATE market.district_aliases, market.district_adjacency, market.districts RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Cities
-- ---------------------------------------------------------------------------
INSERT INTO market.cities (region, name, name_norm)
SELECT region, name, name_norm FROM (
  SELECT region, market.normalize_ar(city) AS name_norm,
         (array_agg(city ORDER BY cnt DESC))[1] AS name
  FROM (SELECT region, city, count(*) cnt FROM market.deals_raw GROUP BY region, city) s
  WHERE market.normalize_ar(city) IS NOT NULL
  GROUP BY region, market.normalize_ar(city)
) c
ON CONFLICT (region, name_norm) DO NOTHING;

UPDATE market.cities SET enabled = true WHERE name_norm IN ('جده', 'الرياض');

-- ---------------------------------------------------------------------------
-- 2. Districts (one row per normalised spelling per city) + aliases
--    Unknown buckets: أخرى / بدون / خارج حدود الاحياء / empty
-- ---------------------------------------------------------------------------
WITH raw AS (
  SELECT c.id AS city_id, r.district AS raw_name, market.normalize_ar(r.district) AS name_norm, count(*) cnt
  FROM market.deals_raw r
  JOIN market.cities c ON c.region = r.region AND c.name_norm = market.normalize_ar(r.city)
  GROUP BY c.id, r.district
)
INSERT INTO market.districts (city_id, name, name_norm, is_unknown)
SELECT city_id,
       (array_agg(raw_name ORDER BY cnt DESC))[1],
       coalesce(name_norm, 'بدون'),
       coalesce(name_norm, 'بدون') IN ('اخري', 'أخرى', 'بدون', 'خارج حدود الاحياء', 'خارج حدود الأحياء')
FROM raw
GROUP BY city_id, coalesce(name_norm, 'بدون')
ON CONFLICT (city_id, name_norm) DO NOTHING;

INSERT INTO market.district_aliases (city_id, raw_name, district_id)
SELECT DISTINCT c.id, r.district, d.id
FROM market.deals_raw r
JOIN market.cities c ON c.region = r.region AND c.name_norm = market.normalize_ar(r.city)
JOIN market.districts d ON d.city_id = c.id AND d.name_norm = coalesce(market.normalize_ar(r.district), 'بدون')
WHERE r.district IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Cleaned deals
-- ---------------------------------------------------------------------------
TRUNCATE market.deals;

INSERT INTO market.deals (deal_id, category, type_raw, type_group, price, area_m2, ppm, ppm_source,
                          deal_date, year_month, region, city_id, district_id, district_raw,
                          plan_raw, plan_norm, plot_raw, plot_norm, notes, source)
SELECT r.deal_id,
       r.category,
       r.type_raw,
       tm.type_group,
       nullif(r.price, '')::numeric,
       nullif(r.area, '')::numeric,
       CASE WHEN nullif(r.area,'')::numeric > 0 THEN round(nullif(r.price,'')::numeric / nullif(r.area,'')::numeric, 2) END,
       nullif(r.ppm_source, '')::numeric,
       to_date(r.deal_date, 'DD/MM/YYYY'),
       date_trunc('month', to_date(r.deal_date, 'DD/MM/YYYY'))::date,
       r.region,
       c.id,
       d.id,
       r.district,
       r.plan_raw,
       market.normalize_code(r.plan_raw),
       r.plot_raw,
       market.normalize_code(r.plot_raw),
       nullif(r.notes, ''),
       r.source
FROM market.deals_raw r
LEFT JOIN market.type_mapping tm ON tm.type_raw = r.type_raw
LEFT JOIN market.cities c ON c.region = r.region AND c.name_norm = market.normalize_ar(r.city)
LEFT JOIN market.district_aliases da ON da.city_id = c.id AND da.raw_name = r.district
LEFT JOIN market.districts d ON d.id = da.district_id;

-- ---------------------------------------------------------------------------
-- 4. Market-deal flag (rules 1-8 of the spec, chapter 6.2)
-- ---------------------------------------------------------------------------
UPDATE market.deals SET exclusion_reason = CASE
  WHEN notes IS NOT NULL AND notes !~ '^صفقة بتمويل$'                       THEN 'non_market_note'   -- هبة، رهن، فك رهن، ورث، فرز/دمج، مشاع
  WHEN price IS NULL OR price <= 1000                                       THEN 'price_too_low'
  WHEN area_m2 IS NULL OR area_m2 <= 0                                      THEN 'area_missing'
  WHEN type_group = 'land'      AND area_m2 < 50                            THEN 'area_too_small'
  WHEN type_group = 'apartment' AND area_m2 < 30                            THEN 'area_too_small'
  WHEN type_group IN ('villa','building') AND area_m2 < 100                 THEN 'area_too_small'
  WHEN type_group IS NULL                                                   THEN 'type_not_priced'
  WHEN category NOT IN ('سكني','تجاري','استعمال مختلط')                     THEN 'category_out_of_scope'
  WHEN plot_raw ~ '^عدد العقارات'                                           THEN 'multi_parcel'
  ELSE NULL END;

-- Percentile trimming per (city, type_group, year): drop ppm outside p1..p99
WITH b AS (
  SELECT city_id, type_group, extract(year FROM deal_date) AS y,
         percentile_cont(0.01) WITHIN GROUP (ORDER BY ppm) AS p01,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY ppm) AS p99
  FROM market.deals
  WHERE exclusion_reason IS NULL
  GROUP BY city_id, type_group, extract(year FROM deal_date)
)
UPDATE market.deals d
SET exclusion_reason = 'ppm_outlier'
FROM b
WHERE d.exclusion_reason IS NULL
  AND d.city_id = b.city_id AND d.type_group = b.type_group AND extract(year FROM d.deal_date) = b.y
  AND (d.ppm < b.p01 OR d.ppm > b.p99);

UPDATE market.deals SET is_market_deal = (exclusion_reason IS NULL);

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_deals_city_district_type_date ON market.deals (city_id, district_id, type_group, deal_date) WHERE is_market_deal;
CREATE INDEX IF NOT EXISTS ix_deals_plan ON market.deals (city_id, plan_norm, type_group, deal_date) WHERE is_market_deal AND plan_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_deals_plot ON market.deals (city_id, plan_norm, plot_norm) WHERE plan_norm IS NOT NULL AND plot_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_districts_city_norm_trgm ON market.districts USING gin (name_norm gin_trgm_ops);
ANALYZE market.deals;

-- ---------------------------------------------------------------------------
-- 6. Report
-- ---------------------------------------------------------------------------
SELECT 'cities' AS what, count(*)::text AS value FROM market.cities
UNION ALL SELECT 'districts', count(*)::text FROM market.districts
UNION ALL SELECT 'districts_jeddah', count(*)::text FROM market.districts d JOIN market.cities c ON c.id=d.city_id WHERE c.name_norm='جده'
UNION ALL SELECT 'districts_riyadh', count(*)::text FROM market.districts d JOIN market.cities c ON c.id=d.city_id WHERE c.name_norm='الرياض'
UNION ALL SELECT 'deals', count(*)::text FROM market.deals
UNION ALL SELECT 'market_deals', count(*)::text FROM market.deals WHERE is_market_deal
UNION ALL SELECT 'excl:' || exclusion_reason, count(*)::text FROM market.deals WHERE exclusion_reason IS NOT NULL GROUP BY exclusion_reason
ORDER BY 1;

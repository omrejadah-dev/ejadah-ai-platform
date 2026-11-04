-- 02_transform.sql — reference tables and the cleaned market.deals, built from market.deals_raw (re-runnable).
--
-- Ids are stable: cities and districts are upserted on their natural keys (region + name_norm, city + name_norm) and never
-- deleted, so app.valuations.district_id, data/geo/*.csv lookups and saved links keep pointing at the same place.
-- The heavy work happens in a staging table; the live tables are swapped in one short transaction at the end, so the
-- app keeps reading the previous data until the commit and never sees an empty market.deals.
\timing on

-- ---------------------------------------------------------------------------
-- 1. Cities (new ones are added, existing ids kept)
-- ---------------------------------------------------------------------------
INSERT INTO market.cities (region, name, name_norm)
SELECT region, name, name_norm FROM (
  SELECT region, market.normalize_ar(city) AS name_norm,
         (array_agg(city ORDER BY cnt DESC, city))[1] AS name
  FROM (SELECT region, city, count(*) cnt FROM market.deals_raw GROUP BY region, city) s
  WHERE market.normalize_ar(city) IS NOT NULL
  GROUP BY region, market.normalize_ar(city)
) c
ORDER BY region, name_norm
ON CONFLICT (region, name_norm) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Districts (one row per normalised spelling per city), upserted: an existing district keeps its id
--    Unknown buckets: أخرى / بدون / خارج حدود الاحياء / empty
--    Display name = the most frequent raw spelling. On a tie the first in sort order is taken for a new district, and an
--    existing district keeps its name while that name is still one of the tied most frequent spellings (no churn).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE district_stage AS
WITH raw AS (
  SELECT c.id AS city_id, r.district AS raw_name, market.normalize_ar(r.district) AS name_norm, count(*) cnt
  FROM market.deals_raw r
  JOIN market.cities c ON c.region = r.region AND c.name_norm = market.normalize_ar(r.city)
  GROUP BY c.id, r.district
), ranked AS (
  SELECT *, coalesce(name_norm, 'بدون') AS norm, max(cnt) OVER (PARTITION BY city_id, coalesce(name_norm, 'بدون')) AS top_cnt FROM raw
)
SELECT city_id, norm AS name_norm,
       (array_agg(raw_name ORDER BY cnt DESC, raw_name))[1] AS name,
       array_agg(raw_name) FILTER (WHERE cnt = top_cnt) AS top_names,
       norm IN ('اخري', 'أخرى', 'بدون', 'خارج حدود الاحياء', 'خارج حدود الأحياء') AS is_unknown
FROM ranked
GROUP BY city_id, norm;

INSERT INTO market.districts (city_id, name, name_norm, is_unknown)
SELECT city_id, name, name_norm, is_unknown FROM district_stage
ORDER BY city_id, name_norm
ON CONFLICT (city_id, name_norm) DO NOTHING;

UPDATE market.districts d
SET name = CASE WHEN coalesce(d.name = ANY (s.top_names), false) THEN d.name ELSE s.name END, is_unknown = s.is_unknown
FROM district_stage s
WHERE s.city_id = d.city_id AND s.name_norm = d.name_norm
  AND (NOT coalesce(d.name = ANY (s.top_names), false) OR d.is_unknown IS DISTINCT FROM s.is_unknown);

CREATE TEMP TABLE alias_stage AS
SELECT DISTINCT c.id AS city_id, r.district AS raw_name, d.id AS district_id
FROM market.deals_raw r
JOIN market.cities c ON c.region = r.region AND c.name_norm = market.normalize_ar(r.city)
JOIN market.districts d ON d.city_id = c.id AND d.name_norm = coalesce(market.normalize_ar(r.district), 'بدون')
WHERE r.district IS NOT NULL;
CREATE UNIQUE INDEX ON alias_stage (city_id, raw_name);
ANALYZE alias_stage;

-- ---------------------------------------------------------------------------
-- 3. Cleaned deals, built in market.deals_stage (dropped at the end)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS market.deals_stage;
CREATE UNLOGGED TABLE market.deals_stage (LIKE market.deals INCLUDING DEFAULTS);

INSERT INTO market.deals_stage (deal_id, category, type_raw, type_group, price, area_m2, ppm, ppm_source,
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
LEFT JOIN alias_stage da ON da.city_id = c.id AND da.raw_name = r.district
LEFT JOIN market.districts d ON d.id = da.district_id;

-- Market-deal flag (rules 1-8 of the spec, chapter 6.2)
UPDATE market.deals_stage SET exclusion_reason = CASE
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
  FROM market.deals_stage
  WHERE exclusion_reason IS NULL
  GROUP BY city_id, type_group, extract(year FROM deal_date)
)
UPDATE market.deals_stage d
SET exclusion_reason = 'ppm_outlier'
FROM b
WHERE d.exclusion_reason IS NULL
  AND d.city_id = b.city_id AND d.type_group = b.type_group AND extract(year FROM d.deal_date) = b.y
  AND (d.ppm < b.p01 OR d.ppm > b.p99);

UPDATE market.deals_stage SET is_market_deal = (exclusion_reason IS NULL);

-- ---------------------------------------------------------------------------
-- 4. Swap: one transaction. DELETE + INSERT (not TRUNCATE) keeps the old rows visible to readers until COMMIT and
--    never takes a lock that blocks them. Which cities the UI shows is set here too (018): every city with market deals.
-- ---------------------------------------------------------------------------
BEGIN;
DELETE FROM market.district_aliases;
INSERT INTO market.district_aliases (city_id, raw_name, district_id) SELECT city_id, raw_name, district_id FROM alias_stage;
DELETE FROM market.deals;
INSERT INTO market.deals SELECT * FROM market.deals_stage;
UPDATE market.cities c SET enabled = EXISTS (SELECT 1 FROM market.deals x WHERE x.city_id = c.id AND x.is_market_deal)
WHERE c.enabled IS DISTINCT FROM EXISTS (SELECT 1 FROM market.deals x WHERE x.city_id = c.id AND x.is_market_deal);
COMMIT;

DROP TABLE market.deals_stage;
VACUUM ANALYZE market.deals;
VACUUM ANALYZE market.district_aliases;

-- ---------------------------------------------------------------------------
-- 5. Report
-- ---------------------------------------------------------------------------
SELECT 'cities' AS what, count(*)::text AS value FROM market.cities
UNION ALL SELECT 'cities_enabled', count(*)::text FROM market.cities WHERE enabled
UNION ALL SELECT 'districts', count(*)::text FROM market.districts
UNION ALL SELECT 'districts_jeddah', count(*)::text FROM market.districts d JOIN market.cities c ON c.id=d.city_id WHERE c.name_norm='جده'
UNION ALL SELECT 'districts_riyadh', count(*)::text FROM market.districts d JOIN market.cities c ON c.id=d.city_id WHERE c.name_norm='الرياض'
UNION ALL SELECT 'deals', count(*)::text FROM market.deals
UNION ALL SELECT 'market_deals', count(*)::text FROM market.deals WHERE is_market_deal
UNION ALL SELECT 'excl:' || exclusion_reason, count(*)::text FROM market.deals WHERE exclusion_reason IS NOT NULL GROUP BY exclusion_reason
ORDER BY 1;

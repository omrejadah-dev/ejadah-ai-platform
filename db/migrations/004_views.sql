-- 004_views.sql — pre-aggregated materialised views used by the pricing engine and the market screens
-- Refresh after any reload: REFRESH MATERIALIZED VIEW CONCURRENTLY market.mv_district_month; (etc.)

DROP MATERIALIZED VIEW IF EXISTS market.mv_district_month;
CREATE MATERIALIZED VIEW market.mv_district_month AS
SELECT city_id, district_id, type_group, year_month,
       count(*)                                              AS n_deals,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY ppm)     AS ppm_median,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY ppm)     AS ppm_p25,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY ppm)     AS ppm_p75,
       sum(price)                                            AS total_value
FROM market.deals
WHERE is_market_deal AND district_id IS NOT NULL
GROUP BY city_id, district_id, type_group, year_month;
CREATE UNIQUE INDEX ON market.mv_district_month (city_id, district_id, type_group, year_month);

DROP MATERIALIZED VIEW IF EXISTS market.mv_city_month;
CREATE MATERIALIZED VIEW market.mv_city_month AS
SELECT city_id, type_group, year_month,
       count(*)                                              AS n_deals,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY ppm)     AS ppm_median,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY ppm)     AS ppm_p25,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY ppm)     AS ppm_p75
FROM market.deals
WHERE is_market_deal
GROUP BY city_id, type_group, year_month;
CREATE UNIQUE INDEX ON market.mv_city_month (city_id, type_group, year_month);

-- yearly district index (what the "district trend" chart reads)
DROP MATERIALIZED VIEW IF EXISTS market.mv_district_year;
CREATE MATERIALIZED VIEW market.mv_district_year AS
SELECT city_id, district_id, type_group, extract(year FROM deal_date)::int AS year,
       count(*) AS n_deals,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median
FROM market.deals
WHERE is_market_deal AND district_id IS NOT NULL
GROUP BY 1,2,3,4;
CREATE UNIQUE INDEX ON market.mv_district_year (city_id, district_id, type_group, year);

DROP MATERIALIZED VIEW IF EXISTS market.mv_plan_stats;
CREATE MATERIALIZED VIEW market.mv_plan_stats AS
SELECT city_id, plan_norm, type_group,
       count(*) AS n_deals,
       min(deal_date) AS first_deal, max(deal_date) AS last_deal,
       count(*) FILTER (WHERE deal_date >= (SELECT max(deal_date) FROM market.deals) - interval '24 months') AS n_last_24m,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median,
       (array_agg(district_id ORDER BY deal_date DESC))[1] AS district_id
FROM market.deals
WHERE is_market_deal AND plan_norm IS NOT NULL
GROUP BY city_id, plan_norm, type_group;
CREATE UNIQUE INDEX ON market.mv_plan_stats (city_id, plan_norm, type_group);

-- data_as_of
CREATE OR REPLACE VIEW market.v_meta AS
SELECT max(deal_date) AS data_as_of, count(*) FILTER (WHERE is_market_deal) AS market_deals, count(*) AS all_deals FROM market.deals;

SELECT 'mv_district_month' AS mv, count(*) FROM market.mv_district_month
UNION ALL SELECT 'mv_city_month', count(*) FROM market.mv_city_month
UNION ALL SELECT 'mv_district_year', count(*) FROM market.mv_district_year
UNION ALL SELECT 'mv_plan_stats', count(*) FROM market.mv_plan_stats;
SELECT * FROM market.v_meta;

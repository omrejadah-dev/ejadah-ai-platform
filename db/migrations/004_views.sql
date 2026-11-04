-- 004_views.sql — pre-aggregated materialised views used by the pricing engine and the market screens.
-- Created empty (WITH NO DATA); db/reload/refresh.sql fills and refreshes every materialised view after a data load.
-- market.v_meta is defined once, in 014 (over mv_meta).

CREATE MATERIALIZED VIEW market.mv_district_month AS
SELECT city_id, district_id, type_group, year_month,
       count(*)                                              AS n_deals,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY ppm)     AS ppm_median,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY ppm)     AS ppm_p25,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY ppm)     AS ppm_p75,
       sum(price)                                            AS total_value
FROM market.deals
WHERE is_market_deal AND district_id IS NOT NULL
GROUP BY city_id, district_id, type_group, year_month
WITH NO DATA;
CREATE UNIQUE INDEX mv_district_month_city_id_district_id_type_group_year_month_idx
  ON market.mv_district_month (city_id, district_id, type_group, year_month);

CREATE MATERIALIZED VIEW market.mv_city_month AS
SELECT city_id, type_group, year_month,
       count(*)                                              AS n_deals,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY ppm)     AS ppm_median,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY ppm)     AS ppm_p25,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY ppm)     AS ppm_p75
FROM market.deals
WHERE is_market_deal
GROUP BY city_id, type_group, year_month
WITH NO DATA;
CREATE UNIQUE INDEX mv_city_month_city_id_type_group_year_month_idx ON market.mv_city_month (city_id, type_group, year_month);

-- yearly district index (what the "district trend" chart reads)
CREATE MATERIALIZED VIEW market.mv_district_year AS
SELECT city_id, district_id, type_group, extract(year FROM deal_date)::int AS year,
       count(*) AS n_deals,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median
FROM market.deals
WHERE is_market_deal AND district_id IS NOT NULL
GROUP BY 1,2,3,4
WITH NO DATA;
CREATE UNIQUE INDEX mv_district_year_city_id_district_id_type_group_year_idx
  ON market.mv_district_year (city_id, district_id, type_group, year);

CREATE MATERIALIZED VIEW market.mv_plan_stats AS
SELECT city_id, plan_norm, type_group,
       count(*) AS n_deals,
       min(deal_date) AS first_deal, max(deal_date) AS last_deal,
       count(*) FILTER (WHERE deal_date >= (SELECT max(deal_date) FROM market.deals) - interval '24 months') AS n_last_24m,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median,
       (array_agg(district_id ORDER BY deal_date DESC))[1] AS district_id
FROM market.deals
WHERE is_market_deal AND plan_norm IS NOT NULL
GROUP BY city_id, plan_norm, type_group
WITH NO DATA;
CREATE UNIQUE INDEX mv_plan_stats_city_id_plan_norm_type_group_idx ON market.mv_plan_stats (city_id, plan_norm, type_group);

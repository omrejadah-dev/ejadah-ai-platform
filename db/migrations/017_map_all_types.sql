-- 017: "الكل" on the map — the four types together, per district and per region and year.
-- A median of all types can't be built from the per-type medians, so these are their own views;
-- v_district_year / v_region_year put them next to the per-type rows under type_group = 'all'.
-- Filled by db/reload/refresh.sql with every other materialised view.

CREATE MATERIALIZED VIEW market.mv_district_year_all AS
SELECT city_id, district_id, extract(year FROM deal_date)::int AS year,
       count(*) AS n_deals,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median
FROM market.deals
WHERE is_market_deal AND district_id IS NOT NULL AND type_group IS NOT NULL
GROUP BY 1, 2, 3
WITH NO DATA;
CREATE UNIQUE INDEX mv_district_year_all_city_id_district_id_year_idx ON market.mv_district_year_all (city_id, district_id, year);

CREATE MATERIALIZED VIEW market.mv_region_year_all AS
SELECT region, extract(year FROM deal_date)::int AS year, count(*) AS n_deals,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median
FROM market.deals WHERE is_market_deal AND type_group IS NOT NULL
GROUP BY 1, 2
WITH NO DATA;
CREATE UNIQUE INDEX mv_region_year_all_region_year_idx ON market.mv_region_year_all (region, year);

CREATE VIEW market.v_district_year AS
SELECT city_id, district_id, type_group, year, n_deals, ppm_median FROM market.mv_district_year
UNION ALL
SELECT city_id, district_id, 'all', year, n_deals, ppm_median FROM market.mv_district_year_all;

CREATE VIEW market.v_region_year AS
SELECT region, type_group, year, n_deals, ppm_median FROM market.mv_region_year
UNION ALL
SELECT region, 'all', year, n_deals, ppm_median FROM market.mv_region_year_all;

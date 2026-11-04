-- 009_region_shapes.sql — the 13 administrative regions as simplified polygons (Kingdom view of the map)
-- Rows produced by tools/geo/build_region_shapes.py → data/geo/region_shapes.csv, loaded by db/reload/03_geo.sql.
CREATE TABLE IF NOT EXISTS market.region_shapes (
  region        text PRIMARY KEY,            -- matches market.cities.region / market.deals.region
  display_name  text NOT NULL,               -- "منطقة الرياض"
  geometry      jsonb NOT NULL,              -- GeoJSON Polygon / MultiPolygon, [lng, lat]
  center_lat    numeric(9,5) NOT NULL,
  center_lng    numeric(9,5) NOT NULL
);

-- per region × type × year (Kingdom view of the map); filled by db/reload/refresh.sql
CREATE MATERIALIZED VIEW market.mv_region_year AS
SELECT region, type_group, extract(year FROM deal_date)::int AS year, count(*) AS n_deals,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median
FROM market.deals WHERE is_market_deal AND type_group IS NOT NULL
GROUP BY 1, 2, 3
WITH NO DATA;
CREATE UNIQUE INDEX mv_region_year_region_type_group_year_idx ON market.mv_region_year (region, type_group, year);

-- 009_region_shapes.sql — the 13 administrative regions as simplified polygons (Kingdom view of the map)
-- Rows produced by tools/geo/build_region_shapes.py → data/geo/region_shapes.csv
CREATE TABLE IF NOT EXISTS market.region_shapes (
  region        text PRIMARY KEY,            -- matches market.cities.region / market.deals.region
  display_name  text NOT NULL,               -- "منطقة الرياض"
  geometry      jsonb NOT NULL,              -- GeoJSON Polygon / MultiPolygon, [lng, lat]
  center_lat    numeric(9,5) NOT NULL,
  center_lng    numeric(9,5) NOT NULL
);

TRUNCATE market.region_shapes;
COPY market.region_shapes (region, display_name, geometry, center_lat, center_lng)
FROM '/data/geo/region_shapes.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

SELECT region, display_name, geometry->>'type' AS t FROM market.region_shapes ORDER BY 1;

-- per region × type × year (Kingdom view of the map); refresh with 004 after any reload
DROP MATERIALIZED VIEW IF EXISTS market.mv_region_year;
CREATE MATERIALIZED VIEW market.mv_region_year AS
SELECT region, type_group, extract(year FROM deal_date)::int AS year, count(*) AS n_deals,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS ppm_median
FROM market.deals WHERE is_market_deal AND type_group IS NOT NULL
GROUP BY 1, 2, 3;
CREATE UNIQUE INDEX ON market.mv_region_year (region, type_group, year);

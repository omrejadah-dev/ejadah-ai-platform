-- 008_geo.sql — district polygons (source: github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts)
-- Rows produced by tools/geo/build_district_shapes.py → data/geo/district_shapes.csv (keyed by region + city + district
-- name, not by id), loaded by db/reload/03_geo.sql.
CREATE TABLE IF NOT EXISTS market.district_shapes (
  district_id  int PRIMARY KEY REFERENCES market.districts(id),
  geo_name     text NOT NULL,                 -- name in the source dataset
  geometry     jsonb NOT NULL,                -- GeoJSON Polygon / MultiPolygon, [lng, lat]
  center_lat   numeric(9,6) NOT NULL,
  center_lng   numeric(9,6) NOT NULL
);

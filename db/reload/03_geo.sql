-- 03_geo.sql — region and district polygons and district neighbours from data/geo/*.csv (re-runnable).
-- The district files are keyed by region + city name_norm + district name_norm (tools/geo/*); ids are resolved here,
-- so the files work against any database. Run after 02_transform.sql (districts must exist).
-- Each table is swapped in one transaction (DELETE + INSERT): readers see the old rows until COMMIT.
\set region_csv :datadir '/geo/region_shapes.csv'
\set shapes_csv :datadir '/geo/district_shapes.csv'
\set adj_csv    :datadir '/geo/district_adjacency.csv'

CREATE TEMP TABLE region_stage (region text, display_name text, geometry jsonb, center_lat numeric, center_lng numeric);
COPY region_stage FROM :'region_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

CREATE TEMP TABLE shape_stage (region text, city text, district text, geo_name text, geometry jsonb, center_lat numeric, center_lng numeric);
COPY shape_stage FROM :'shapes_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

CREATE TEMP TABLE adj_stage (region text, city text, district text, neighbor text);
COPY adj_stage FROM :'adj_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

-- natural key -> id
CREATE TEMP TABLE dkey AS
SELECT c.region, c.name_norm AS city, d.name_norm AS district, d.id
FROM market.districts d JOIN market.cities c ON c.id = d.city_id;
CREATE UNIQUE INDEX ON dkey (region, city, district);

DO $$
DECLARE n_shape int; n_adj int;
BEGIN
  SELECT count(*) INTO n_shape FROM shape_stage s
  WHERE NOT EXISTS (SELECT 1 FROM dkey k WHERE (k.region, k.city, k.district) = (s.region, s.city, s.district));
  SELECT count(*) INTO n_adj FROM adj_stage a
  WHERE NOT EXISTS (SELECT 1 FROM dkey k WHERE (k.region, k.city, k.district) = (a.region, a.city, a.district))
     OR NOT EXISTS (SELECT 1 FROM dkey k WHERE (k.region, k.city, k.district) = (a.region, a.city, a.neighbor));
  IF n_shape > 0 OR n_adj > 0 THEN
    RAISE WARNING 'geo rows naming a district this database does not have (skipped): % shapes, % neighbour pairs', n_shape, n_adj;
  END IF;
END $$;

BEGIN;
DELETE FROM market.region_shapes;
INSERT INTO market.region_shapes (region, display_name, geometry, center_lat, center_lng)
SELECT region, display_name, geometry, center_lat, center_lng FROM region_stage;

DELETE FROM market.district_shapes;
INSERT INTO market.district_shapes (district_id, geo_name, geometry, center_lat, center_lng)
SELECT k.id, s.geo_name, s.geometry, s.center_lat, s.center_lng
FROM shape_stage s JOIN dkey k USING (region, city, district);

DELETE FROM market.district_adjacency;
INSERT INTO market.district_adjacency (district_id, neighbor_id)
SELECT a.id, b.id
FROM adj_stage s
JOIN dkey a ON (a.region, a.city, a.district) = (s.region, s.city, s.district)
JOIN dkey b ON (b.region, b.city, b.district) = (s.region, s.city, s.neighbor);
COMMIT;

ANALYZE market.region_shapes; ANALYZE market.district_shapes; ANALYZE market.district_adjacency;
SELECT (SELECT count(*) FROM market.region_shapes) AS regions, (SELECT count(*) FROM market.district_shapes) AS district_shapes,
       (SELECT count(*) FROM market.district_adjacency) AS adjacency_pairs;

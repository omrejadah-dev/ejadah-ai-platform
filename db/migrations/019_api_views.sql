-- 019_api_views.sql — rules and aggregates the API used to repeat inline (code review, 2026-11-04).
-- Idempotent: safe to re-run; the REFRESH at the end also makes it the step to run after a data reload (003 + 004).
-- Nothing here depends on objects that 004/009/014/017 drop and re-create (mv_city_month, mv_*_year, mv_meta, v_meta),
-- so re-running those migrations never fails or silently drops these.

-- ---------------------------------------------------------------------------
-- identity: the effective account status (admin panel and sign-in both read it)
-- An account past its end date counts as expired even while its row still says active.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW identity.v_account_status AS
SELECT a.id AS account_id,
       CASE WHEN a.status = 'active' AND a.expires_at < current_date THEN 'expired' ELSE a.status END AS status
FROM identity.accounts a;

-- ---------------------------------------------------------------------------
-- admins are not seats: their estimates / questions / AI calls keep seat_id NULL (seat_id gets an FK to identity.seats)
-- and record the admin here instead, so an admin can still open and list what they made.
-- ---------------------------------------------------------------------------
ALTER TABLE app.valuations      ADD COLUMN IF NOT EXISTS admin_id uuid;
ALTER TABLE app.legal_questions ADD COLUMN IF NOT EXISTS admin_id uuid;
ALTER TABLE ops.ai_calls        ADD COLUMN IF NOT EXISTS admin_id uuid;

-- rows written before this fix stored the admin id in seat_id
UPDATE app.valuations      SET admin_id = seat_id, seat_id = NULL WHERE seat_id IN (SELECT id FROM identity.admins);
UPDATE app.legal_questions SET admin_id = seat_id, seat_id = NULL WHERE seat_id IN (SELECT id FROM identity.admins);
UPDATE ops.ai_calls        SET admin_id = seat_id, seat_id = NULL WHERE seat_id IN (SELECT id FROM identity.admins);

-- ---------------------------------------------------------------------------
-- map: which cities have a district map. One rule for the city list and for where a click on a region lands.
-- (Deal counts come from mv_city_month in the query: a view on it would block 004's DROP of that view.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW market.v_mapped_cities AS
SELECT c.id AS city_id, c.name, c.region, count(*) AS districts
FROM market.cities c
JOIN market.districts d ON d.city_id = c.id
JOIN market.district_shapes s ON s.district_id = d.id
GROUP BY c.id
HAVING count(*) >= 3;

-- the five cut points of the map's six colour classes (rounded), e.g. market.sextiles(array_agg(ppm_median))
CREATE OR REPLACE FUNCTION market.sextiles(vals float8[]) RETURNS numeric[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT array_agg(round(q::numeric) ORDER BY i)
  FROM unnest((SELECT percentile_cont(ARRAY[1/6.0, 2/6.0, 3/6.0, 4/6.0, 5/6.0]) WITHIN GROUP (ORDER BY v) FROM unnest(vals) v))
       WITH ORDINALITY AS t(q, i)
$$;

-- ---------------------------------------------------------------------------
-- map: recent activity per district and per region, per type and for the four together ('all').
-- Was computed live from market.deals by the city map, the Kingdom view and the district panel.
-- Window ends at the last deal date (same as market.v_meta.data_as_of), read from deals so mv_meta is not a dependency.
-- After a data reload: REFRESH MATERIALIZED VIEW CONCURRENTLY market.mv_district_recent; (and mv_region_recent) — or re-run this file.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS market.mv_district_recent AS
WITH asof AS (SELECT max(deal_date) AS d FROM market.deals)
SELECT x.city_id, x.district_id,
       CASE WHEN GROUPING(x.type_group) = 1 THEN 'all' ELSE x.type_group END AS type_group,
       count(*) FILTER (WHERE x.deal_date > asof.d - interval '12 months') AS n_12m,
       count(*) AS n_24m,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY x.ppm) AS ppm_median   -- 24 months
FROM market.deals x CROSS JOIN asof
WHERE x.is_market_deal AND x.district_id IS NOT NULL AND x.type_group IS NOT NULL
  AND x.deal_date > asof.d - interval '24 months'
GROUP BY GROUPING SETS ((x.city_id, x.district_id, x.type_group), (x.city_id, x.district_id));
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_district_recent ON market.mv_district_recent (city_id, district_id, type_group);
CREATE INDEX IF NOT EXISTS ix_mv_district_recent_district ON market.mv_district_recent (district_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS market.mv_region_recent AS
WITH asof AS (SELECT max(deal_date) AS d FROM market.deals)
SELECT x.region,
       CASE WHEN GROUPING(x.type_group) = 1 THEN 'all' ELSE x.type_group END AS type_group,
       count(*) FILTER (WHERE x.deal_date > asof.d - interval '12 months') AS n_12m,
       count(*) AS n_24m,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY x.ppm) AS ppm_median   -- 24 months
FROM market.deals x CROSS JOIN asof
WHERE x.is_market_deal AND x.region IS NOT NULL AND x.type_group IS NOT NULL
  AND x.deal_date > asof.d - interval '24 months'
GROUP BY GROUPING SETS ((x.region, x.type_group), (x.region));
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_region_recent ON market.mv_region_recent (region, type_group);

REFRESH MATERIALIZED VIEW market.mv_district_recent;
REFRESH MATERIALIZED VIEW market.mv_region_recent;

SELECT (SELECT count(*) FROM market.v_mapped_cities)    AS mapped_cities,
       (SELECT count(*) FROM market.mv_district_recent) AS district_rows,
       (SELECT count(*) FROM market.mv_region_recent)   AS region_rows;

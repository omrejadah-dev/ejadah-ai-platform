-- 029_size_adjustment.sql — price per m² is adjusted for the size of the property being priced.
--
-- Within the same district and year, a smaller property sells at a higher price per m² (a Jeddah villa of half the size
-- at ~40% more per m²). The engine already weighted similar sizes more, but priced a 200 m² villa from the district's
-- typical villa. Now each comparable deal's price per m² is scaled to the subject's area: ppm x (area / deal area)^beta,
-- with beta per city and type measured here (log price per m² on log area, inside district x year groups of 5+ deals,
-- last 36 months). Only where at least 300 such deals exist; elsewhere no adjustment (beta 0), because borrowing the
-- national figure made Jeddah buildings worse. Clamped to [-0.6, 0].
--
-- Backtest (tools/pricing, 1,437 deals, betas measured on the 36 months BEFORE the test window): median error 16.7% -> 16.0%,
-- high confidence within ±20% 69% -> 70% (617 -> 642 estimates high), Jeddah villas 32.7% -> 27.1%, Riyadh apartments
-- 15.7% -> 12.8%; 76 cities outside the test 23.4% -> 23.0%, none worse. The range (028) is re-measured on this engine.
--
-- A materialised view, so db/reload/refresh.sql recomputes it whenever the deals are reloaded.
CREATE MATERIALIZED VIEW market.mv_size_beta AS
WITH d AS (
  SELECT d.city_id, d.type_group, d.district_id, extract(year FROM d.deal_date) AS y, ln(d.area_m2) AS la, ln(d.ppm) AS lp
  FROM market.deals d
  WHERE d.is_market_deal AND d.district_id IS NOT NULL AND d.area_m2 > 0 AND d.ppm > 0
    AND d.deal_date > (SELECT max(deal_date) FROM market.deals) - interval '36 months'),   -- not v_meta: empty in a new database
g AS (
  SELECT city_id, type_group, la - avg(la) OVER w AS dla, lp - avg(lp) OVER w AS dlp, count(*) OVER w AS n
  FROM d WINDOW w AS (PARTITION BY city_id, type_group, district_id, y))
SELECT city_id, type_group, count(*)::int AS n_deals,
       greatest(-0.6, least(0, sum(dla * dlp) / nullif(sum(dla * dla), 0)))::numeric(5, 3) AS beta
FROM g WHERE n >= 5
GROUP BY city_id, type_group
HAVING count(*) >= 300;
CREATE UNIQUE INDEX ux_mv_size_beta ON market.mv_size_beta (city_id, type_group);

-- the range re-measured on the size-adjusted engine (same rule as 028: a type needs 100+ backtest deals at that confidence)
DELETE FROM market.pricing_band;
INSERT INTO market.pricing_band (confidence, type_group, lo_ratio, hi_ratio, n_backtest, calibrated) VALUES
  ('high',   NULL,        0.75, 1.25, 642, '2026-11-24'),
  ('high',   'apartment', 0.73, 1.20, 288, '2026-11-24'),
  ('high',   'building',  0.77, 1.21, 108, '2026-11-24'),
  ('high',   'land',      0.78, 1.40, 221, '2026-11-24'),
  ('medium', NULL,        0.66, 1.51, 473, '2026-11-24'),
  ('medium', 'apartment', 0.63, 1.34, 127, '2026-11-24'),
  ('medium', 'building',  0.66, 1.53, 207, '2026-11-24'),
  ('medium', 'land',      0.82, 1.58, 112, '2026-11-24'),
  ('low',    NULL,        0.61, 2.05, 322, '2026-11-24'),
  ('low',    'building',  0.53, 1.81, 135, '2026-11-24'),
  ('low',    'land',      0.67, 2.04, 117, '2026-11-24');

-- 02b_rules.sql — market-deal rules that compare a deal with other deals, run on market.deals after the transform.
-- Re-runnable on its own (`db/reload/run.sh rules refresh`): it first gives back the deals it excluded last time, then
-- decides again, in one transaction (readers see the old flags until COMMIT).
--
-- below_land_value (2026-11-17): a villa or a building recorded for less than 30% of the price per m2 of bare land
-- around it is not a market sale (it includes its own plot, so it cannot be worth much less than the plot) (a 383 m2 villa in Makkah for 10,000 SAR; a 900 m2 villa in
-- Riyadh for 190,000). Around it = land market deals of the same district and year when there are at least 20,
-- otherwise of the same city and year (at least 20), otherwise no check. Cheap houses in small towns stay: there the
-- land is cheap too. Apartments are left out: their price per m2 is per m2 of the flat, which in dear districts is
-- rightly below the price of a m2 of land (a 188 m2 flat in Jeddah for 550,000 would be cut). Measured on the September
-- 2026 known-price check and the 1,437-deal backtest (tools/pricing/).
BEGIN;

UPDATE market.deals SET exclusion_reason = NULL, is_market_deal = true WHERE exclusion_reason = 'below_land_value';

WITH land_district AS (
  SELECT district_id, extract(year FROM deal_date) AS y, percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS m
  FROM market.deals WHERE is_market_deal AND type_group = 'land' AND district_id IS NOT NULL
  GROUP BY 1, 2 HAVING count(*) >= 20
), land_city AS (
  SELECT city_id, extract(year FROM deal_date) AS y, percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm) AS m
  FROM market.deals WHERE is_market_deal AND type_group = 'land'
  GROUP BY 1, 2 HAVING count(*) >= 20
)
UPDATE market.deals d SET exclusion_reason = 'below_land_value', is_market_deal = false
FROM (
  SELECT x.deal_id, coalesce(ld.m, lc.m) AS land_ppm
  FROM market.deals x
  LEFT JOIN land_district ld ON ld.district_id = x.district_id AND ld.y = extract(year FROM x.deal_date)
  LEFT JOIN land_city lc ON lc.city_id = x.city_id AND lc.y = extract(year FROM x.deal_date)
  WHERE x.is_market_deal AND x.type_group IN ('villa', 'building')
) b
WHERE d.deal_id = b.deal_id AND b.land_ppm IS NOT NULL AND d.ppm < 0.3 * b.land_ppm;

COMMIT;
VACUUM ANALYZE market.deals;

SELECT type_group, count(*) AS excluded_below_land_value FROM market.deals WHERE exclusion_reason = 'below_land_value'
GROUP BY 1 ORDER BY 1;

-- Pricing backtest, step 1: the test set.
-- Up to 150 market deals per city x type from the last 6 months of data (Riyadh, Jeddah, Dammam),
-- picked by a stable hash so reruns use the same deals. Each is later priced with p_as_of = its own date.
CREATE SCHEMA IF NOT EXISTS eval;
DROP TABLE IF EXISTS eval.bt_result;
DROP TABLE IF EXISTS eval.bt_sample;
CREATE TABLE eval.bt_sample AS
SELECT deal_id, city_id, district_id, type_group, area_m2, ppm, plan_norm, deal_date, chunk
FROM (
  SELECT d.*, row_number() OVER (PARTITION BY d.city_id, d.type_group ORDER BY md5(d.deal_id)) AS rn,
         abs(hashtext(d.deal_id)) % 4 AS chunk
  FROM market.deals d JOIN market.districts ds ON ds.id = d.district_id AND NOT ds.is_unknown
  WHERE d.is_market_deal AND d.city_id IN (44, 223, 81)
    AND d.deal_date >= (SELECT data_as_of FROM market.v_meta) - interval '6 months'
) x WHERE rn <= 150;
CREATE TABLE eval.bt_result (deal_id text PRIMARY KEY, est jsonb, baseline numeric);
SELECT city_id, type_group, count(*) FROM eval.bt_sample GROUP BY 1, 2 ORDER BY 1, 2;

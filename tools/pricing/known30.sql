-- Acceptance check: 30 properties with a known price (PLAN.md phase G: "30 عقاراً معلوم السعر … داخل النطاق في 80%").
-- No list came from the business, so the known prices are real market deals of the last month of data (September 2026),
-- spread over the four types and six cities, picked by a stable hash (reruns use the same 30). Each is priced as if
-- today were the day of the deal (p_as_of = deal_date: only deals strictly before it count), with its plan number as a
-- broker would enter it, and compared with what was actually paid.
--   docker exec -i ejadah-ai-postgres psql -U ejadah -d ejadah_ai < tools/pricing/known30.sql
CREATE SCHEMA IF NOT EXISTS eval;
DROP TABLE IF EXISTS eval.known30;
CREATE TABLE eval.known30 AS
WITH quota(type_group, city, n) AS (VALUES
  ('land','الرياض',3), ('land','جده',3), ('land','الدمام',2), ('land','مكة المكرمة',1), ('land','المدينة المنورة',1), ('land','بريده',1),
  ('apartment','الرياض',2), ('apartment','جده',3), ('apartment','الدمام',1), ('apartment','مكة المكرمة',1), ('apartment','المدينة المنورة',1),
  ('villa','الرياض',2), ('villa','جده',2), ('villa','الدمام',1), ('villa','المدينة المنورة',1), ('villa','مكة المكرمة',1),
  ('building','الرياض',2), ('building','جده',2), ('building','الدمام',1), ('building','مكة المكرمة',1)),
pool AS (
  SELECT d.deal_id, d.city_id, c.name AS city, d.district_id, dd.name AS district, d.type_group, d.area_m2,
         d.plan_norm, d.deal_date, d.price, d.ppm,
         row_number() OVER (PARTITION BY d.type_group, c.name ORDER BY md5(d.deal_id)) AS k
  FROM market.deals d
  JOIN market.cities c ON c.id = d.city_id
  JOIN market.districts dd ON dd.id = d.district_id AND NOT dd.is_unknown
  WHERE d.is_market_deal AND d.deal_date >= '2026-09-01' AND d.deal_date <= '2026-09-30')
SELECT p.*, e.est
FROM pool p JOIN quota q ON q.type_group = p.type_group AND q.city = p.city AND p.k <= q.n
CROSS JOIN LATERAL (SELECT market.estimate_price(p.city_id, p.district_id, p.type_group, p.area_m2, p.plan_norm, NULL, p.deal_date) AS est) e;

\echo '== the 30 properties'
SELECT row_number() OVER (ORDER BY type_group, city, district) AS "#", type_group AS type, city, district, round(area_m2) AS m2,
       deal_date AS date, round(price) AS actual_price,
       (est->>'total_estimate')::numeric AS estimate, (est->>'total_low')::numeric AS low, (est->>'total_high')::numeric AS high,
       round(100 * ((est->>'ppm_estimate')::numeric / ppm - 1)) AS "err%",
       CASE WHEN est->>'ppm_estimate' IS NULL THEN 'no price'
            WHEN ppm BETWEEN (est->>'ppm_low')::numeric AND (est->>'ppm_high')::numeric THEN 'in range' ELSE 'outside' END AS result,
       est->>'confidence' AS confidence
FROM eval.known30 ORDER BY 1;

\echo '== summary'
SELECT count(*) AS n,
       count(*) FILTER (WHERE est->>'ppm_estimate' IS NOT NULL) AS priced,
       count(*) FILTER (WHERE ppm BETWEEN (est->>'ppm_low')::numeric AND (est->>'ppm_high')::numeric) AS in_range,
       round(100.0 * count(*) FILTER (WHERE ppm BETWEEN (est->>'ppm_low')::numeric AND (est->>'ppm_high')::numeric)
             / nullif(count(*) FILTER (WHERE est->>'ppm_estimate' IS NOT NULL), 0)) AS "in_range% of priced",
       count(*) FILTER (WHERE abs((est->>'ppm_estimate')::numeric / ppm - 1) <= 0.20) AS within_20pct,
       round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY abs((est->>'ppm_estimate')::numeric / ppm - 1))::numeric, 1) AS "median abs err%"
FROM eval.known30;

\echo '== by confidence'
SELECT est->>'confidence' AS confidence, count(*) AS n,
       count(*) FILTER (WHERE ppm BETWEEN (est->>'ppm_low')::numeric AND (est->>'ppm_high')::numeric) AS in_range,
       count(*) FILTER (WHERE abs((est->>'ppm_estimate')::numeric / ppm - 1) <= 0.20) AS within_20pct
FROM eval.known30 GROUP BY 1 ORDER BY 1;

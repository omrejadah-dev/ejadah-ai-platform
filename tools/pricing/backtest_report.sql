-- Pricing backtest, step 3: the report.
-- err = estimate / actual - 1 on price per m2. MdAPE = median absolute error. in_range = actual inside the low-high band.
DROP VIEW IF EXISTS eval.bt;
CREATE VIEW eval.bt AS
SELECT s.*, r.est->>'confidence' AS conf, (r.est->>'level_used')::int AS lvl,
       (r.est->>'ppm_estimate')::numeric AS est, (r.est->>'ppm_low')::numeric AS lo, (r.est->>'ppm_high')::numeric AS hi,
       (r.est->>'ppm_estimate')::numeric / s.ppm - 1 AS err, r.baseline / s.ppm - 1 AS berr
FROM eval.bt_sample s JOIN eval.bt_result r USING (deal_id) WHERE s.ppm > 0;

\echo '== by type'
SELECT type_group, count(*) n,
       round(100.0 * count(est) / count(*)) "priced%",
       round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err))::numeric, 1) "MdAPE%",
       round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(berr))::numeric, 1) "baseline MdAPE%",
       round(100.0 * avg((abs(err) <= 0.10)::int)) "within10%",
       round(100.0 * avg((abs(err) <= 0.20)::int)) "within20%",
       round(100.0 * avg((ppm BETWEEN lo AND hi)::int)) "in_range%",
       round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY err)::numeric, 1) "bias%"
FROM eval.bt GROUP BY ROLLUP (type_group) ORDER BY 1;

\echo '== by confidence (priced only)'
SELECT conf, count(*) n,
       round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err))::numeric, 1) "MdAPE%",
       round(100.0 * avg((abs(err) <= 0.10)::int)) "within10%",
       round(100.0 * avg((abs(err) <= 0.20)::int)) "within20%",
       round(100.0 * avg((ppm BETWEEN lo AND hi)::int)) "in_range%"
FROM eval.bt WHERE est IS NOT NULL GROUP BY conf ORDER BY 1;

\echo '== by city x type (priced only)'
SELECT c.name city, type_group, count(*) n,
       round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err))::numeric, 1) "MdAPE%",
       round(100.0 * avg((abs(err) <= 0.20)::int)) "within20%",
       round(100.0 * avg((conf = 'high')::int)) "high%"
FROM eval.bt b JOIN market.cities c ON c.id = b.city_id WHERE est IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== by level used'
SELECT lvl, count(*) n, round(100 * percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err))::numeric, 1) "MdAPE%"
FROM eval.bt WHERE est IS NOT NULL GROUP BY 1 ORDER BY 1;

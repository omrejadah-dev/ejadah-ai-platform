-- db/tests/pricing_engine.sql — checks market.estimate_price against the synthetic deals of pricing_fixtures.sql.
-- Each check prints "ok  <name>" or stops the run with what it expected and what it got. Run: bash db/tests/run.sh
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

CREATE FUNCTION pg_temp.ok(name text, pass boolean, got text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF pass IS NOT TRUE THEN RAISE EXCEPTION 'FAIL  %  (got: %)', name, got; END IF;
  RAISE NOTICE 'ok    %', name;
END $$;
CREATE FUNCTION pg_temp.est(city int, district int, type text, area numeric, plan text DEFAULT NULL, as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$ SELECT market.estimate_price(city, district, type, area, plan, NULL, as_of) $$;
CREATE FUNCTION pg_temp.n(e jsonb, k text) RETURNS numeric LANGUAGE sql AS $$ SELECT (e->>k)::numeric $$;

-- the data date is the latest deal
SELECT pg_temp.ok('data date = latest deal', data_as_of = date '2026-09-30', data_as_of::text) FROM market.v_meta;

-- district level: 20 identical deals -> exactly that price, high confidence, the 12-month window
SELECT pg_temp.ok('district: level 2, 12 months', pg_temp.n(e, 'level_used') = 2 AND pg_temp.n(e, 'window_months') = 12, e->>'level_used' || ' / ' || (e->>'window_months')),
       pg_temp.ok('district: price per m² = the deals', pg_temp.n(e, 'ppm_estimate') = 1000, e->>'ppm_estimate'),
       pg_temp.ok('district: total = price x area', pg_temp.n(e, 'total_estimate') = 500000, e->>'total_estimate'),
       pg_temp.ok('district: identical deals -> high confidence', e->>'confidence' = 'high', e->>'confidence'),
       pg_temp.ok('district: sample size', pg_temp.n(e, 'sample_size') = 20, e->>'sample_size'),
       pg_temp.ok('district: comparables listed', jsonb_array_length(e->'comparables') = 10, jsonb_array_length(e->'comparables')::text)
FROM (SELECT pg_temp.est(9001, 90011, 'land', 500) e) x;

-- the range: the estimate x the measured band of its confidence and type (028/029: high land 0.78 – 1.40)
SELECT pg_temp.ok('range: band of high x land', pg_temp.n(e, 'ppm_low') = round(1000 * b.lo_ratio / 10) * 10 AND pg_temp.n(e, 'ppm_high') = round(1000 * b.hi_ratio / 10) * 10,
                  (e->>'ppm_low') || ' – ' || (e->>'ppm_high')),
       pg_temp.ok('range: total follows the band', pg_temp.n(e, 'total_low') = round(500000 * b.lo_ratio / 10000) * 10000, e->>'total_low')
FROM (SELECT pg_temp.est(9001, 90011, 'land', 500) e) x
JOIN market.pricing_band b ON b.confidence = 'high' AND b.type_group = 'land';

-- plan level: the plan's own 8 deals win over the district's 28
SELECT pg_temp.ok('plan: level 1 with the plan number', pg_temp.n(e, 'level_used') = 1, e->>'level_used'),
       pg_temp.ok('plan: priced from the plan''s deals', pg_temp.n(e, 'ppm_estimate') = 2000, e->>'ppm_estimate')
FROM (SELECT pg_temp.est(9001, 90012, 'land', 500, 'p7') e) x;
SELECT pg_temp.ok('plan: without the plan number -> the district', pg_temp.n(e, 'level_used') = 2 AND pg_temp.n(e, 'ppm_estimate') = 1000,
                  (e->>'level_used') || ' / ' || (e->>'ppm_estimate'))
FROM (SELECT pg_temp.est(9001, 90012, 'land', 500) e) x;

-- spread prices: the middle, but not high confidence
SELECT pg_temp.ok('spread: weighted median in the middle', pg_temp.n(e, 'ppm_estimate') BETWEEN 950 AND 1050, e->>'ppm_estimate'),
       pg_temp.ok('spread: wide sample is not high confidence', e->>'confidence' <> 'high', e->>'confidence'),
       pg_temp.ok('spread: dispersion reported', pg_temp.n(e, 'iqr_ratio') > 0.25, e->>'iqr_ratio')
FROM (SELECT pg_temp.est(9001, 90013, 'land', 500) e) x;

-- neighbours: 5 deals in the district are not enough; with the adjacent district they are
SELECT pg_temp.ok('neighbours: level 3', pg_temp.n(e, 'level_used') = 3, e->>'level_used'),
       -- 25 deals (5 + 20) are enough before trimming; 10% cut from each tail leaves the 19 the price is built on
       pg_temp.ok('neighbours: district + neighbour deals, tails trimmed', pg_temp.n(e, 'sample_size') = 19, e->>'sample_size'),
       pg_temp.ok('neighbours: price', pg_temp.n(e, 'ppm_estimate') = 3000, e->>'ppm_estimate')
FROM (SELECT pg_temp.est(9001, 90014, 'apartment', 150) e) x;

-- city: no villa in the district and no neighbours -> the whole city
SELECT pg_temp.ok('city: level 4', pg_temp.n(e, 'level_used') = 4, e->>'level_used'),
       pg_temp.ok('city: price', pg_temp.n(e, 'ppm_estimate') = 4000, e->>'ppm_estimate'),
       pg_temp.ok('city: never high confidence', e->>'confidence' <> 'high', e->>'confidence')
FROM (SELECT pg_temp.est(9001, 90016, 'villa', 400) e) x;

-- too few deals anywhere -> no price at all
SELECT pg_temp.ok('insufficient: no price', e->>'confidence' = 'insufficient' AND e->>'ppm_estimate' IS NULL AND e->>'level_used' IS NULL, e::text)
FROM (SELECT pg_temp.est(9001, 90019, 'building', 600) e) x;

-- as of a date: only deals strictly before it count (backtests rely on this)
SELECT pg_temp.ok('as_of: deals after the date are invisible', e->>'confidence' = 'insufficient', e->>'confidence')
FROM (SELECT pg_temp.est(9001, 90011, 'land', 500, NULL, date '2025-01-01') e) x;
SELECT pg_temp.ok('as_of: data date moves back', e->>'data_as_of' = '2026-06-29', e->>'data_as_of')
FROM (SELECT pg_temp.est(9001, 90011, 'land', 500, NULL, date '2026-06-30') e) x;

-- size: the coefficient is measured from the deals (built with -0.3) and each deal is scaled to the subject's area
SELECT pg_temp.ok('size: coefficient measured', beta BETWEEN -0.31 AND -0.29, beta::text)
FROM market.mv_size_beta WHERE city_id = 9002 AND type_group = 'apartment';
SELECT pg_temp.ok('size: no coefficient where too few deals', NOT EXISTS (SELECT 1 FROM market.mv_size_beta WHERE city_id = 9001), 'a row for city 9001');
SELECT pg_temp.ok('size: 100 m² priced at its own size', abs(pg_temp.n(e, 'ppm_estimate') / (20000 * power(100, -0.3)) - 1) < 0.01,
                  (e->>'ppm_estimate') || ' vs ' || round(20000 * power(100, -0.3)))
FROM (SELECT pg_temp.est(9002, 90021, 'apartment', 100) e) x;
SELECT pg_temp.ok('size: 250 m² cheaper per m²', abs(pg_temp.n(e, 'ppm_estimate') / (20000 * power(250, -0.3)) - 1) < 0.01,
                  (e->>'ppm_estimate') || ' vs ' || round(20000 * power(250, -0.3)))
FROM (SELECT pg_temp.est(9002, 90021, 'apartment', 250) e) x;

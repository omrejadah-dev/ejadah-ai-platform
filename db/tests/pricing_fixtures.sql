-- db/tests/pricing_fixtures.sql — synthetic deals with known answers, for db/tests/pricing_engine.sql.
-- Loaded into an EMPTY test database (db/tests/run.sh builds it from the migrations), never into real data.
-- The data date is 2026-09-30 (the latest deal). Every group below is shaped so one engine rule decides its result.
--
--   city 1 «مدينة الاختبار»                         city 2 «مدينة الحجم»
--     district A   land: 20 deals at 1,000/m², 500 m²      district S   apartment: 420 deals, ppm = 20,000 x area^-0.3
--     district P   land: 20 at 1,000 + plan P7: 8 at 2,000             (so the size coefficient measures -0.3)
--     district W   land: 20 deals spread 500 – 1,500
--     district B   apartment: 5 deals   } neighbours: B's sample needs C (level 3)
--     district C   apartment: 20 deals  }
--     district D   no deals; villas: 35 in other districts -> the whole city (level 4)
--     district X   building: 10 deals in the whole city -> not enough for any level
INSERT INTO market.cities (id, region, name, name_norm, enabled) VALUES
  (9001, 'منطقة الاختبار', 'مدينة الاختبار', 'مدينه الاختبار', true),
  (9002, 'منطقة الاختبار', 'مدينة الحجم', 'مدينه الحجم', true);
INSERT INTO market.districts (id, city_id, name, name_norm) VALUES
  (90011, 9001, 'حي أ', 'حي ا'), (90012, 9001, 'حي المخطط', 'حي المخطط'), (90013, 9001, 'حي متفرق', 'حي متفرق'),
  (90014, 9001, 'حي ب', 'حي ب'), (90015, 9001, 'حي ج', 'حي ج'), (90016, 9001, 'حي د', 'حي د'),
  (90017, 9001, 'حي هـ', 'حي ه'), (90018, 9001, 'حي و', 'حي و'), (90019, 9001, 'حي العمائر', 'حي العمائر'),
  (90021, 9002, 'حي س', 'حي س');
INSERT INTO market.district_adjacency (district_id, neighbor_id) VALUES (90014, 90015), (90015, 90014);

-- one row per deal: id, city, district, type, area, ppm, date, plan
CREATE TEMP TABLE fx (deal_id text, city_id int, district_id int, type_group text, area numeric, ppm numeric, deal_date date, plan_norm text);

-- A: 20 identical land deals in the last 11 months
INSERT INTO fx SELECT 'A' || i, 9001, 90011, 'land', 500, 1000, date '2026-09-30' - (i * 16), NULL FROM generate_series(0, 19) i;
-- P: 20 land deals at 1,000 and, inside plan P7, 8 at 2,000 (all in the last 12 months)
INSERT INTO fx SELECT 'P' || i, 9001, 90012, 'land', 500, 1000, date '2026-09-20' - (i * 15), NULL FROM generate_series(0, 19) i;
INSERT INTO fx SELECT 'P7-' || i, 9001, 90012, 'land', 500, 2000, date '2026-09-25' - (i * 30), 'p7' FROM generate_series(0, 7) i;
-- W: 20 land deals spread evenly from 500 to 1,500 per m² (wide: not high confidence)
INSERT INTO fx SELECT 'W' || i, 9001, 90013, 'land', 500, 500 + i * 1000.0 / 19, date '2026-09-28' - (i * 15), NULL FROM generate_series(0, 19) i;
-- B (5) + its neighbour C (20): apartments, at 3,000 per m²
INSERT INTO fx SELECT 'B' || i, 9001, 90014, 'apartment', 150, 3000, date '2026-09-15' - (i * 40), NULL FROM generate_series(0, 4) i;
INSERT INTO fx SELECT 'C' || i, 9001, 90015, 'apartment', 150, 3000, date '2026-09-10' - (i * 30), NULL FROM generate_series(0, 19) i;
-- 35 villas at 4,000 per m², spread over districts E and F (none in D), last 10 months
INSERT INTO fx SELECT 'V' || i, 9001, CASE WHEN i % 2 = 0 THEN 90017 ELSE 90018 END, 'villa', 400, 4000, date '2026-09-29' - (i * 8), NULL FROM generate_series(0, 34) i;
-- 10 buildings in the whole city: below every tier's minimum
INSERT INTO fx SELECT 'X' || i, 9001, 90019, 'building', 600, 5000, date '2026-09-01' - (i * 20), NULL FROM generate_series(0, 9) i;
-- S: 420 apartments, areas 80..290 m², price per m² falling with size (elasticity -0.3), all inside the last 36 months
INSERT INTO fx SELECT 'S' || i, 9002, 90021, 'apartment', 80 + (i % 22) * 10, round(20000 * power(80 + (i % 22) * 10, -0.3), 2),
                      date '2026-09-30' - ((i % 30) * 30), NULL FROM generate_series(0, 419) i;
-- the data date: one more A deal on 2026-09-30 is already there (i = 0)

INSERT INTO market.deals (deal_id, type_group, price, area_m2, ppm, deal_date, year_month, region, city_id, district_id,
                          plan_raw, plan_norm, source, is_market_deal)
SELECT f.deal_id, f.type_group, f.area * f.ppm, f.area, f.ppm, f.deal_date, date_trunc('month', f.deal_date)::date,
       'منطقة الاختبار', f.city_id, f.district_id, f.plan_norm, f.plan_norm, 'test', true
FROM fx f;

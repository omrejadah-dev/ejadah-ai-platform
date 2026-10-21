-- Pricing engine load test straight on the database: each transaction prices one of the 1,437 real properties
-- from the accuracy test (eval.bt_sample, built by tools/pricing/backtest_setup.sql), so districts and types are mixed.
--   docker cp tools/loadtest/estimate.pgbench.sql ejadah-ai-postgres:/tmp/est.sql
--   docker exec ejadah-ai-postgres pgbench -U ejadah -d ejadah_ai -n -c 16 -j 16 -T 20 -f /tmp/est.sql
\set k random(1, 1437)
select market.estimate_price(city_id, district_id, type_group, area_m2, plan_norm, null)
from (select * from eval.bt_sample order by deal_id offset :k - 1 limit 1) s;

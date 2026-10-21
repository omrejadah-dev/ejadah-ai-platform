-- 014_meta_cache.sql — market.v_meta used to scan all 4.6M deals on every call (max date + two counts).
-- estimate_price reads it first, so that one scan was ~430-750 ms of every price (load test, PLAN.md / docs/system-design.md).
-- The data only changes on a reload, so the numbers are stored once; v_meta keeps its columns, every caller is unchanged.
-- After any data reload (003 + 004): REFRESH MATERIALIZED VIEW market.mv_meta;
DROP MATERIALIZED VIEW IF EXISTS market.mv_meta CASCADE;
CREATE MATERIALIZED VIEW market.mv_meta AS
SELECT max(deal_date) AS data_as_of,
       count(*) FILTER (WHERE is_market_deal) AS market_deals,
       count(*) AS all_deals
FROM market.deals;

CREATE OR REPLACE VIEW market.v_meta AS SELECT data_as_of, market_deals, all_deals FROM market.mv_meta;

SELECT * FROM market.v_meta;

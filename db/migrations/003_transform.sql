-- 003_transform.sql — indexes on the cleaned deals and the district names.
-- The transform itself (cities, districts, aliases, cleaned deals, market-deal flags) is data, not schema:
-- it now lives in db/reload/02_transform.sql (run by db/reload/run.sh), which upserts districts so their ids never change.

CREATE INDEX IF NOT EXISTS ix_deals_city_district_type_date ON market.deals (city_id, district_id, type_group, deal_date) WHERE is_market_deal;
CREATE INDEX IF NOT EXISTS ix_deals_plan ON market.deals (city_id, plan_norm, type_group, deal_date) WHERE is_market_deal AND plan_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_deals_plot ON market.deals (city_id, plan_norm, plot_norm) WHERE plan_norm IS NOT NULL AND plot_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_districts_city_norm_trgm ON market.districts USING gin (name_norm gin_trgm_ops);

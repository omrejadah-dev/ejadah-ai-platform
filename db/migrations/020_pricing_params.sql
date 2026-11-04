-- 020_pricing_params.sql — the pricing engine's constants as data instead of literals inside estimate_price
-- (db/functions/estimate_price.sql reads them on every call). Values are exactly the ones 011 hard-coded, written with
-- the same literals (numeric keeps the scale it is given, so 18.0 stays 18.0 and results stay byte-identical).
-- Change them only with a backtest (tools/pricing/backtest_*.sql) and a new migration.
--
-- Not the same thing as app.pricing_settings (012): those are business caps Ejadah edits from the admin panel and the
-- backend applies AFTER the market price (property adjustments, AI adjustment). These are the statistics of the market
-- price itself, owned by engineering; keeping them apart means an admin-panel edit can never move the market estimate.

-- Search ladder: tiers are tried in `ord` order, the first with enough deals wins.
CREATE TABLE market.pricing_tiers (
  ord            int  PRIMARY KEY,
  level          int  NOT NULL,             -- 1 plan, 2 district, 3 district + neighbours, 4 city (reported as level_used)
  window_months  int  NOT NULL CHECK (window_months > 0),
  min_sample     int  NOT NULL CHECK (min_sample > 0),
  scope          text NOT NULL,
  CHECK ((level, scope) IN ((1, 'plan'), (2, 'district'), (3, 'adjacent'), (4, 'city')))   -- confidence rules use level
);
INSERT INTO market.pricing_tiers (ord, level, window_months, min_sample, scope) VALUES
  (1, 1, 12,  8, 'plan'),     (2, 1, 24,  8, 'plan'),     (3, 1, 48,  8, 'plan'),
  (4, 2, 12, 15, 'district'), (5, 2, 24, 15, 'district'), (6, 2, 36, 15, 'district'), (7, 2, 60, 15, 'district'),
  (8, 3, 36, 20, 'adjacent'),
  (9, 4, 24, 30, 'city');

-- One row of scalar constants.
CREATE TABLE market.pricing_params (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  days_per_month            numeric NOT NULL,   -- deal age in months = days / this
  recency_half_life_months  numeric NOT NULL,   -- a deal's weight halves every this many months
  trim_min_sample           int     NOT NULL,   -- tails are trimmed only when the sample is larger than this
  trim_low                  numeric NOT NULL,   -- keep percent_rank between trim_low and trim_high
  trim_high                 numeric NOT NULL,
  time_adj_cap_pct          numeric NOT NULL,   -- the time adjustment is capped at ± this %
  district_index_min_deals  int     NOT NULL,   -- district index used for the time adjustment only with this many deals on both sides
  conf_high_max_level       int     NOT NULL,   -- confidence 'high': level <= and sample >= and window <= and IQR/estimate <=
  conf_high_min_sample      int     NOT NULL,
  conf_high_max_window      int     NOT NULL,
  conf_high_max_iqr_ratio   numeric NOT NULL,
  conf_medium_max_level     int     NOT NULL,   -- confidence 'medium': same four tests, looser; otherwise 'low'
  conf_medium_min_sample    int     NOT NULL,
  conf_medium_max_window    int     NOT NULL,
  conf_medium_max_iqr_ratio numeric NOT NULL,
  ppm_round                 numeric NOT NULL,   -- price per m² rounded to this (SAR)
  total_round               numeric NOT NULL    -- total price rounded to this (SAR)
);
INSERT INTO market.pricing_params VALUES
  (true, 30.44, 18.0, 20, 0.10, 0.90, 30, 10, 2, 15, 24, 0.25, 3, 8, 48, 0.45, 10, 10000);

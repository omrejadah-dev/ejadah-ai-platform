-- 028_pricing_band.sql — the price range is measured, not the middle half of the sample.
--
-- Until now ppm_low/high were the sample's weighted quartiles (25–75%). The backtest (tools/pricing/backtest_*.sql,
-- 1,437 recent deals priced with only the deals before them) showed that band held the actual price only 39% of the
-- time (high confidence 34%), and the 30 known prices (tools/pricing/known30.sql) 9 of 30, against the 80% target.
-- The band is now estimate x the 10th and 90th percentile of (actual / estimate) in the backtest, per confidence and
-- type, so it holds ~80% of actual prices. A type with under 100 backtest deals at that confidence uses the
-- confidence's row for all types (type_group NULL). Recalibrate after any engine change: rerun the backtest and update.
CREATE TABLE market.pricing_band (
  confidence  text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  type_group  text CHECK (type_group IN ('land', 'villa', 'apartment', 'building')),   -- NULL = every type
  lo_ratio    numeric NOT NULL CHECK (lo_ratio > 0 AND lo_ratio < 1),
  hi_ratio    numeric NOT NULL CHECK (hi_ratio > 1),
  n_backtest  int NOT NULL,
  calibrated  date NOT NULL
);
CREATE UNIQUE INDEX ux_pricing_band ON market.pricing_band (confidence, coalesce(type_group, ''));

INSERT INTO market.pricing_band (confidence, type_group, lo_ratio, hi_ratio, n_backtest, calibrated) VALUES
  ('high',   NULL,        0.74, 1.25, 617, '2026-11-24'),
  ('high',   'apartment', 0.70, 1.21, 276, '2026-11-24'),
  ('high',   'building',  0.74, 1.22, 110, '2026-11-24'),
  ('high',   'land',      0.77, 1.33, 208, '2026-11-24'),
  ('medium', NULL,        0.64, 1.54, 476, '2026-11-24'),
  ('medium', 'apartment', 0.64, 1.42, 139, '2026-11-24'),
  ('medium', 'building',  0.59, 1.53, 191, '2026-11-24'),
  ('medium', 'land',      0.76, 1.72, 123, '2026-11-24'),
  ('low',    NULL,        0.57, 2.11, 344, '2026-11-24'),
  ('low',    'building',  0.54, 1.77, 149, '2026-11-24'),
  ('low',    'land',      0.64, 2.07, 119, '2026-11-24');

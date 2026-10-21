-- Pricing backtest, step 2: price one chunk. psql -v chunk=0..3 (run the four in parallel)
--   -v fn=market.estimate_price -v tbl=eval.bt_result   (or an experimental function and its own result table)
-- baseline = plain median of the same district and type over the 12 months before the deal (what a broker would eyeball).
INSERT INTO :tbl
SELECT s.deal_id,
       :fn(s.city_id, s.district_id, s.type_group, s.area_m2, s.plan_norm, NULL, s.deal_date),
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.ppm) FROM market.deals d
         WHERE d.is_market_deal AND d.city_id = s.city_id AND d.district_id = s.district_id AND d.type_group = s.type_group
           AND d.deal_date < s.deal_date AND d.deal_date >= s.deal_date - interval '12 months')
FROM eval.bt_sample s WHERE s.chunk = :chunk
ON CONFLICT (deal_id) DO NOTHING;

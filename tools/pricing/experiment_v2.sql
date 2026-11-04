-- Experiment: extra weighted quantiles (q10..q90) next to the engine's own estimate, for calibrating the low-high range.
-- (The area-similarity weighting this file first tried was adopted in 011 and lives in db/functions/estimate_price.sql.)
-- Built on the canonical engine: the estimate is market.estimate_price itself, and the sample for the extra quantiles is
-- re-read through the same helpers (market.pricing_deals, market.pricing_params, market.pricing_tiers), so only the
-- weight formula below is repeated (estimate_price keeps it inline for speed). Keep the two in step.
--   psql -f tools/pricing/experiment_v2.sql, then tools/pricing/backtest_run.sql with -v fn=eval.estimate_price_v2
CREATE SCHEMA IF NOT EXISTS eval;
CREATE OR REPLACE FUNCTION eval.estimate_price_v2(
  p_city_id     int,
  p_district_id int,
  p_type_group  text,
  p_area        numeric,
  p_plan_norm   text DEFAULT NULL,
  p_plot_norm   text DEFAULT NULL,
  p_as_of       date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_est    jsonb := market.estimate_price(p_city_id, p_district_id, p_type_group, p_area, p_plan_norm, p_plot_norm, p_as_of);
  v_cut    date  := (v_est->>'data_as_of')::date + 1;
  v_scope  text;
  v_f      numeric := 1 + coalesce((v_est->>'time_adjustment_pct')::numeric, 0) / 100;
  v_vals   numeric[];
  v_w      numeric[];
BEGIN
  IF v_est->>'level_used' IS NULL THEN RETURN v_est; END IF;
  SELECT scope INTO v_scope FROM market.pricing_tiers WHERE level = (v_est->>'level_used')::int LIMIT 1;

  SELECT array_agg(ppm ORDER BY ppm), array_agg(w ORDER BY ppm) INTO v_vals, v_w
  FROM (
    SELECT d.ppm,
           (power(0.5, ((v_cut - 1 - d.deal_date) / prm.days_per_month) / prm.recency_half_life_months)
            * power(0.5, abs(ln(d.area_m2 / p_area)) / ln(2)))::numeric AS w,
           percent_rank() OVER (ORDER BY d.ppm) AS pr, count(*) OVER () AS n_all,
           prm.trim_min_sample, prm.trim_low, prm.trim_high
    FROM market.pricing_deals(p_city_id, p_type_group, v_scope, p_district_id, p_plan_norm,
                              (v_est->>'window_months')::int, v_cut - 1, v_cut) d
    CROSS JOIN market.pricing_params prm
  ) s
  WHERE n_all <= trim_min_sample OR (pr >= trim_low AND pr <= trim_high);

  RETURN v_est || jsonb_build_object(
    'q10', market.wquantile(v_vals, v_w, 0.10) * v_f, 'q15', market.wquantile(v_vals, v_w, 0.15) * v_f,
    'q20', market.wquantile(v_vals, v_w, 0.20) * v_f, 'q80', market.wquantile(v_vals, v_w, 0.80) * v_f,
    'q85', market.wquantile(v_vals, v_w, 0.85) * v_f, 'q90', market.wquantile(v_vals, v_w, 0.90) * v_f);
END $$;

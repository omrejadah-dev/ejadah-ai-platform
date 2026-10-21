-- Experiment: area-similarity weighting (weight halves per doubling of size difference) + extra quantiles for range calibration.
CREATE OR REPLACE FUNCTION eval.estimate_price_v2(
  p_city_id     int,
  p_district_id int,
  p_type_group  text,
  p_area        numeric,
  p_plan_norm   text DEFAULT NULL,
  p_plot_norm   text DEFAULT NULL,
  p_as_of       date DEFAULT NULL   -- backtesting: price as if today were p_as_of (only deals strictly before it)
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_as_of        date;
  v_level        int;
  v_window       int;
  v_n            int := 0;
  v_vals         numeric[];
  v_w            numeric[];
  v_ppm          numeric;  v_p25 numeric;  v_p75 numeric;
  v_med_age      numeric;  -- months
  v_adj          numeric := 0;
  v_conf         text;
  v_comps        jsonb;
  v_dtrend       jsonb;
  v_ctrend       jsonb;
  v_plot_info    jsonb;
  v_scope_sql    text;
  v_min          int;
  r              record;
  v_iqr_ratio    numeric;
  v_cut          date;   -- deals must be strictly before this date
  v_mv_cut       date;   -- monthly views: whole months before this date only
BEGIN
  SELECT data_as_of INTO v_as_of FROM market.v_meta;
  v_cut    := coalesce(p_as_of, v_as_of + 1);
  v_as_of  := v_cut - 1;
  v_mv_cut := CASE WHEN p_as_of IS NULL THEN v_cut + 31 ELSE date_trunc('month', p_as_of)::date END;

  -- Level 0: same plot ever sold (information only)
  IF p_plan_norm IS NOT NULL AND p_plot_norm IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('date', deal_date, 'price', price, 'area', area_m2, 'ppm', ppm) ORDER BY deal_date DESC)
      INTO v_plot_info
    FROM market.deals
    WHERE city_id = p_city_id AND plan_norm = p_plan_norm AND plot_norm = p_plot_norm AND is_market_deal AND deal_date < v_cut;
  END IF;

  -- Tiered search: (level, window_months, min_sample, scope predicate)
  FOR r IN
    SELECT * FROM (VALUES
      (1, 12,  8, 'plan'),  (1, 24,  8, 'plan'),  (1, 48,  8, 'plan'),
      (2, 12, 15, 'district'), (2, 24, 15, 'district'), (2, 36, 15, 'district'), (2, 60, 15, 'district'),
      (3, 36, 20, 'adjacent'),
      (4, 24, 30, 'city')
    ) AS t(lvl, win, min_n, scope)
  LOOP
    CONTINUE WHEN r.scope = 'plan' AND p_plan_norm IS NULL;
    CONTINUE WHEN r.scope IN ('district','adjacent') AND p_district_id IS NULL;

    SELECT array_agg(ppm ORDER BY ppm), array_agg(w ORDER BY ppm), count(*),
           market.wquantile(array_agg(age ORDER BY ppm), array_agg(w ORDER BY ppm), 0.5)
      INTO v_vals, v_w, v_n, v_med_age
    FROM (
      SELECT d.ppm,
             ((v_as_of - d.deal_date) / 30.44)::numeric AS age,
             (power(0.5, ((v_as_of - d.deal_date) / 30.44) / 18.0) * power(0.5, abs(ln(d.area_m2 / p_area)) / ln(2)))::numeric AS w,
             percent_rank() OVER (ORDER BY d.ppm) AS pr,
             count(*) OVER () AS n_all
      FROM market.deals d
      WHERE d.is_market_deal AND d.city_id = p_city_id AND d.type_group = p_type_group
        AND d.deal_date > v_as_of - (r.win || ' months')::interval AND d.deal_date < v_cut
        AND CASE r.scope
              WHEN 'plan'     THEN d.plan_norm = p_plan_norm
              WHEN 'district' THEN d.district_id = p_district_id
              WHEN 'adjacent' THEN d.district_id = p_district_id
                                OR d.district_id IN (SELECT neighbor_id FROM market.district_adjacency WHERE district_id = p_district_id)
              ELSE TRUE
            END
    ) s
    WHERE n_all <= 20 OR (pr >= 0.10 AND pr <= 0.90);   -- trim 10% each tail when sample > 20

    IF v_n >= r.min_n THEN
      v_level := r.lvl; v_window := r.win; v_min := r.min_n;
      EXIT;
    END IF;
  END LOOP;

  IF v_level IS NULL THEN
    RETURN jsonb_build_object(
      'confidence', 'insufficient', 'level_used', NULL, 'sample_size', coalesce(v_n, 0),
      'data_as_of', v_as_of, 'plot_history', v_plot_info,
      'city_trend', (SELECT jsonb_agg(jsonb_build_object('year', extract(year FROM year_month)::int, 'ppm_median', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median))::numeric), 'n_deals', sum(n_deals)) ORDER BY extract(year FROM year_month))
                      FROM (SELECT year_month, ppm_median, n_deals FROM market.mv_city_month WHERE city_id = p_city_id AND type_group = p_type_group) x
                      GROUP BY extract(year FROM year_month)));
  END IF;

  v_ppm := market.wquantile(v_vals, v_w, 0.5);
  v_p25 := market.wquantile(v_vals, v_w, 0.25);
  v_p75 := market.wquantile(v_vals, v_w, 0.75);

  -- Time adjustment when the sample is old: latest-12-month index vs index around the sample's median age.
  -- District index first (needs >= 10 deals on both sides), city index otherwise.
  IF v_med_age > 12 THEN
    IF p_district_id IS NOT NULL THEN
      SELECT round((100 * (recent.m / older.m - 1))::numeric, 1) INTO v_adj
      FROM (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m, sum(n_deals) n FROM market.mv_district_month
            WHERE city_id = p_city_id AND district_id = p_district_id AND type_group = p_type_group AND year_month > v_as_of - interval '12 months' AND year_month < v_mv_cut) recent,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m, sum(n_deals) n FROM market.mv_district_month
            WHERE city_id = p_city_id AND district_id = p_district_id AND type_group = p_type_group
              AND year_month BETWEEN v_as_of - ((v_med_age + 6) || ' months')::interval AND v_as_of - ((v_med_age - 6) || ' months')::interval AND year_month < v_mv_cut) older
      WHERE older.m > 0 AND recent.m > 0 AND older.n >= 10 AND recent.n >= 10;
    END IF;
    IF v_adj IS NULL OR v_adj = 0 THEN
      SELECT round((100 * (recent.m / older.m - 1))::numeric, 1) INTO v_adj
      FROM (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m FROM market.mv_city_month
            WHERE city_id = p_city_id AND type_group = p_type_group AND year_month > v_as_of - interval '12 months' AND year_month < v_mv_cut) recent,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m FROM market.mv_city_month
            WHERE city_id = p_city_id AND type_group = p_type_group
              AND year_month BETWEEN v_as_of - ((v_med_age + 6) || ' months')::interval AND v_as_of - ((v_med_age - 6) || ' months')::interval AND year_month < v_mv_cut) older
      WHERE older.m > 0 AND recent.m > 0;
    END IF;
    v_adj := greatest(-30, least(30, coalesce(v_adj, 0)));   -- cap the correction at ±30%
    v_ppm := v_ppm * (1 + v_adj / 100); v_p25 := v_p25 * (1 + v_adj / 100); v_p75 := v_p75 * (1 + v_adj / 100);
  END IF;

  -- Confidence (spec 6.6)
  v_iqr_ratio := CASE WHEN v_ppm > 0 THEN (v_p75 - v_p25) / v_ppm ELSE 1 END;
  v_conf := CASE
    WHEN v_level <= 2 AND v_n >= 15 AND v_window <= 24 AND v_iqr_ratio <= 0.25 THEN 'high'
    WHEN v_level <= 3 AND v_n >= 8  AND v_window <= 48 AND v_iqr_ratio <= 0.45 THEN 'medium'
    ELSE 'low' END;

  -- Comparables: 10 most recent deals in the scope that was used
  SELECT jsonb_agg(c ORDER BY (c->>'date') DESC) INTO v_comps FROM (
    SELECT jsonb_build_object('date', d.deal_date, 'district', ds.name, 'plan', d.plan_raw, 'plot', d.plot_raw,
                              'area', d.area_m2, 'ppm', d.ppm, 'price', d.price) AS c
    FROM market.deals d LEFT JOIN market.districts ds ON ds.id = d.district_id
    WHERE d.is_market_deal AND d.city_id = p_city_id AND d.type_group = p_type_group
      AND d.deal_date > v_as_of - (v_window || ' months')::interval AND d.deal_date < v_cut
      AND CASE v_level WHEN 1 THEN d.plan_norm = p_plan_norm
                       WHEN 2 THEN d.district_id = p_district_id
                       WHEN 3 THEN d.district_id = p_district_id OR d.district_id IN (SELECT neighbor_id FROM market.district_adjacency WHERE district_id = p_district_id)
                       ELSE TRUE END
    ORDER BY d.deal_date DESC LIMIT 10) q;

  SELECT jsonb_agg(jsonb_build_object('year', year, 'ppm_median', round(ppm_median::numeric), 'n_deals', n_deals) ORDER BY year) INTO v_dtrend
  FROM market.mv_district_year WHERE city_id = p_city_id AND district_id = p_district_id AND type_group = p_type_group;

  SELECT jsonb_agg(jsonb_build_object('year', y, 'ppm_median', round(m::numeric), 'n_deals', n) ORDER BY y) INTO v_ctrend
  FROM (SELECT extract(year FROM year_month)::int y, percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m, sum(n_deals) n
        FROM market.mv_city_month WHERE city_id = p_city_id AND type_group = p_type_group GROUP BY 1) x;

  RETURN jsonb_build_object(
    'ppm_estimate',    round(v_ppm / 10) * 10,
    'ppm_low',         round(v_p25 / 10) * 10,
    'ppm_high',        round(v_p75 / 10) * 10,
    'total_estimate',  round(v_ppm * p_area / 10000) * 10000,
    'total_low',       round(v_p25 * p_area / 10000) * 10000,
    'total_high',      round(v_p75 * p_area / 10000) * 10000,
    'q10', market.wquantile(v_vals, v_w, 0.10) * (1 + v_adj / 100), 'q15', market.wquantile(v_vals, v_w, 0.15) * (1 + v_adj / 100),
    'q20', market.wquantile(v_vals, v_w, 0.20) * (1 + v_adj / 100), 'q80', market.wquantile(v_vals, v_w, 0.80) * (1 + v_adj / 100),
    'q85', market.wquantile(v_vals, v_w, 0.85) * (1 + v_adj / 100), 'q90', market.wquantile(v_vals, v_w, 0.90) * (1 + v_adj / 100),
    'confidence',      v_conf,
    'level_used',      v_level,
    'window_months',   v_window,
    'sample_size',     v_n,
    'sample_median_age_months', round(v_med_age, 1),
    'time_adjustment_pct', v_adj,
    'iqr_ratio',       round(v_iqr_ratio, 3),
    'comparables',     coalesce(v_comps, '[]'::jsonb),
    'district_trend',  coalesce(v_dtrend, '[]'::jsonb),
    'city_trend',      coalesce(v_ctrend, '[]'::jsonb),
    'plot_history',    v_plot_info,
    'data_as_of',      v_as_of
  );
END $$;


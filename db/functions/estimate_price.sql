-- db/functions/estimate_price.sql — the pricing engine (spec chapter 6). The ONE definition: db/migrate.sh re-applies
-- every file in db/functions/ after the migrations on every run, so edit this file in place (005/010/011 are history).
--
--   SELECT market.estimate_price(city_id, district_id, 'land', 600, 'plan_norm', 'plot_norm' [, as_of]);
--
-- Constants live in market.pricing_tiers / market.pricing_params (migration 020).
-- Returns jsonb: ppm_estimate/low/high, total_estimate/low/high, confidence, level_used, window_months, sample_size,
-- sample_median_age_months, time_adjustment_pct, iqr_ratio, comparables[], district_trend[], city_trend[], plot_history,
-- data_as_of. With too few deals: confidence 'insufficient', level_used null, city_trend, plot_history, data_as_of.
-- Any change here must keep tools/pricing/backtest_*.sql results (or be a deliberate, measured change).

-- Weighted median / quantile over (value, weight) pairs
CREATE OR REPLACE FUNCTION market.wquantile(vals numeric[], weights numeric[], q numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  WITH p AS (
    SELECT v, w, sum(w) OVER (ORDER BY v) AS cum, sum(w) OVER () AS tot
    FROM unnest(vals, weights) AS t(v, w)
  )
  SELECT v FROM p WHERE cum >= q * tot ORDER BY v LIMIT 1;
$$;

-- Market deals of one city and type inside a scope (plan | district | adjacent | city) and a window of months ending
-- just before p_cut. Shared by the sample and the comparables. Plain SQL so the planner inlines it into the caller.
-- (Kept one level deep on purpose: a second SQL helper wrapping it, re-inlined on every tier, cost ~10 ms per price.)
CREATE OR REPLACE FUNCTION market.pricing_deals(
  p_city_id int, p_type_group text, p_scope text, p_district_id int, p_plan_norm text,
  p_window int, p_as_of date, p_cut date
) RETURNS SETOF market.deals LANGUAGE sql STABLE AS $$
  SELECT d.*
  FROM market.deals d
  WHERE d.is_market_deal AND d.city_id = p_city_id AND d.type_group = p_type_group
    AND d.deal_date > p_as_of - (p_window || ' months')::interval AND d.deal_date < p_cut
    AND CASE p_scope
          WHEN 'plan'     THEN d.plan_norm = p_plan_norm
          WHEN 'district' THEN d.district_id = p_district_id
          WHEN 'adjacent' THEN d.district_id = p_district_id
                            OR d.district_id IN (SELECT neighbor_id FROM market.district_adjacency WHERE district_id = p_district_id)
          ELSE TRUE
        END
$$;

-- Yearly city index for one type (median of the monthly medians, deals per year)
CREATE OR REPLACE FUNCTION market.pricing_city_trend(p_city_id int, p_type_group text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('year', y, 'ppm_median', round(m::numeric), 'n_deals', n) ORDER BY y), '[]'::jsonb)
  FROM (SELECT extract(year FROM year_month)::int y, percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m, sum(n_deals) n
        FROM market.mv_city_month WHERE city_id = p_city_id AND type_group = p_type_group GROUP BY 1) x
$$;

CREATE OR REPLACE FUNCTION market.estimate_price(
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
  prm            market.pricing_params;
  v_as_of        date;
  v_level        int;
  v_window       int;
  v_scope        text;
  v_n            int := 0;
  v_vals         numeric[];
  v_w            numeric[];
  v_ppm          numeric;  v_p25 numeric;  v_p75 numeric;
  v_med_age      numeric;  -- months
  v_adj          numeric := 0;
  v_conf         text;
  v_comps        jsonb;
  v_dtrend       jsonb;
  v_plot_info    jsonb;
  r              record;
  v_iqr_ratio    numeric;
  v_cut          date;   -- deals must be strictly before this date
  v_mv_cut       date;   -- monthly views: whole months before this date only
BEGIN
  SELECT * INTO prm FROM market.pricing_params;
  IF NOT FOUND THEN RAISE EXCEPTION 'market.pricing_params is empty (migration 020)'; END IF;

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

  -- Tiered search: the first tier with enough deals wins
  FOR r IN SELECT level AS lvl, window_months AS win, min_sample AS min_n, scope FROM market.pricing_tiers ORDER BY ord
  LOOP
    CONTINUE WHEN r.scope = 'plan' AND p_plan_norm IS NULL;
    CONTINUE WHEN r.scope IN ('district','adjacent') AND p_district_id IS NULL;

    SELECT array_agg(ppm ORDER BY ppm), array_agg(w ORDER BY ppm), count(*),
           market.wquantile(array_agg(age ORDER BY ppm), array_agg(w ORDER BY ppm), 0.5)
      INTO v_vals, v_w, v_n, v_med_age
    FROM (
      -- weight: recency halves every recency_half_life_months; size halves per doubling of the size gap to p_area
      SELECT d.ppm,
             ((v_as_of - d.deal_date) / prm.days_per_month)::numeric AS age,
             (power(0.5, ((v_as_of - d.deal_date) / prm.days_per_month) / prm.recency_half_life_months)
              * power(0.5, abs(ln(d.area_m2 / p_area)) / ln(2)))::numeric AS w,
             percent_rank() OVER (ORDER BY d.ppm) AS pr,
             count(*) OVER () AS n_all
      FROM market.pricing_deals(p_city_id, p_type_group, r.scope, p_district_id, p_plan_norm, r.win, v_as_of, v_cut) d
    ) s
    WHERE n_all <= prm.trim_min_sample OR (pr >= prm.trim_low AND pr <= prm.trim_high);   -- trim tails of a large sample

    IF v_n >= r.min_n THEN
      v_level := r.lvl; v_window := r.win; v_scope := r.scope;
      EXIT;
    END IF;
  END LOOP;

  IF v_level IS NULL THEN
    RETURN jsonb_build_object(
      'confidence', 'insufficient', 'level_used', NULL, 'sample_size', coalesce(v_n, 0),
      'data_as_of', v_as_of, 'plot_history', v_plot_info,
      'city_trend', market.pricing_city_trend(p_city_id, p_type_group));
  END IF;

  v_ppm := market.wquantile(v_vals, v_w, 0.5);
  v_p25 := market.wquantile(v_vals, v_w, 0.25);
  v_p75 := market.wquantile(v_vals, v_w, 0.75);

  -- Time adjustment when the sample is old: latest-12-month index vs index around the sample's median age.
  -- District index first (needs district_index_min_deals on both sides), city index otherwise.
  IF v_med_age > 12 THEN
    IF p_district_id IS NOT NULL THEN
      SELECT round((100 * (recent.m / older.m - 1))::numeric, 1) INTO v_adj
      FROM (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m, sum(n_deals) n FROM market.mv_district_month
            WHERE city_id = p_city_id AND district_id = p_district_id AND type_group = p_type_group AND year_month > v_as_of - interval '12 months' AND year_month < v_mv_cut) recent,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ppm_median) m, sum(n_deals) n FROM market.mv_district_month
            WHERE city_id = p_city_id AND district_id = p_district_id AND type_group = p_type_group
              AND year_month BETWEEN v_as_of - ((v_med_age + 6) || ' months')::interval AND v_as_of - ((v_med_age - 6) || ' months')::interval AND year_month < v_mv_cut) older
      WHERE older.m > 0 AND recent.m > 0 AND older.n >= prm.district_index_min_deals AND recent.n >= prm.district_index_min_deals;
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
    v_adj := greatest(-prm.time_adj_cap_pct, least(prm.time_adj_cap_pct, coalesce(v_adj, 0)));   -- cap the correction
    v_ppm := v_ppm * (1 + v_adj / 100); v_p25 := v_p25 * (1 + v_adj / 100); v_p75 := v_p75 * (1 + v_adj / 100);
  END IF;

  -- Confidence (spec 6.6)
  v_iqr_ratio := CASE WHEN v_ppm > 0 THEN (v_p75 - v_p25) / v_ppm ELSE 1 END;
  v_conf := CASE
    WHEN v_level <= prm.conf_high_max_level AND v_n >= prm.conf_high_min_sample
     AND v_window <= prm.conf_high_max_window AND v_iqr_ratio <= prm.conf_high_max_iqr_ratio THEN 'high'
    WHEN v_level <= prm.conf_medium_max_level AND v_n >= prm.conf_medium_min_sample
     AND v_window <= prm.conf_medium_max_window AND v_iqr_ratio <= prm.conf_medium_max_iqr_ratio THEN 'medium'
    ELSE 'low' END;

  -- Comparables: 10 most recent deals in the scope that was used
  SELECT jsonb_agg(c ORDER BY (c->>'date') DESC) INTO v_comps FROM (
    SELECT jsonb_build_object('date', d.deal_date, 'district', ds.name, 'plan', d.plan_raw, 'plot', d.plot_raw,
                              'area', d.area_m2, 'ppm', d.ppm, 'price', d.price) AS c
    FROM market.pricing_deals(p_city_id, p_type_group, v_scope, p_district_id, p_plan_norm, v_window, v_as_of, v_cut) d
    LEFT JOIN market.districts ds ON ds.id = d.district_id
    ORDER BY d.deal_date DESC LIMIT 10) q;

  SELECT jsonb_agg(jsonb_build_object('year', year, 'ppm_median', round(ppm_median::numeric), 'n_deals', n_deals) ORDER BY year) INTO v_dtrend
  FROM market.mv_district_year WHERE city_id = p_city_id AND district_id = p_district_id AND type_group = p_type_group;

  RETURN jsonb_build_object(
    'ppm_estimate',    round(v_ppm / prm.ppm_round) * prm.ppm_round,
    'ppm_low',         round(v_p25 / prm.ppm_round) * prm.ppm_round,
    'ppm_high',        round(v_p75 / prm.ppm_round) * prm.ppm_round,
    'total_estimate',  round(v_ppm * p_area / prm.total_round) * prm.total_round,
    'total_low',       round(v_p25 * p_area / prm.total_round) * prm.total_round,
    'total_high',      round(v_p75 * p_area / prm.total_round) * prm.total_round,
    'confidence',      v_conf,
    'level_used',      v_level,
    'window_months',   v_window,
    'sample_size',     v_n,
    'sample_median_age_months', round(v_med_age, 1),
    'time_adjustment_pct', v_adj,
    'iqr_ratio',       round(v_iqr_ratio, 3),
    'comparables',     coalesce(v_comps, '[]'::jsonb),
    'district_trend',  coalesce(v_dtrend, '[]'::jsonb),
    'city_trend',      market.pricing_city_trend(p_city_id, p_type_group),
    'plot_history',    v_plot_info,
    'data_as_of',      v_as_of
  );
END $$;

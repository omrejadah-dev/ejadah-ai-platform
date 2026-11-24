-- 025: an empty district search (the box just focused) suggests where to start instead of showing nothing: the two
-- busiest districts of each of the busiest cities. Typed text matches as in 024. Both rank and count by market deals in
-- the last 12 months (mv_district_recent), so the number next to a district means the same thing everywhere.
CREATE OR REPLACE FUNCTION market.search_districts_all(p_q text, p_limit int DEFAULT 12)
RETURNS TABLE (id int, name text, city_id int, city text, region text, n_market_deals bigint)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
BEGIN
  IF coalesce(btrim(p_q), '') = '' THEN
    RETURN QUERY
    WITH per AS (
      SELECT d.id, d.name, d.city_id, c.name AS city, c.region, sum(r.n_12m)::bigint AS n,
             row_number() OVER (PARTITION BY d.city_id ORDER BY sum(r.n_12m) DESC) AS k,
             sum(sum(r.n_12m)) OVER (PARTITION BY d.city_id) AS city_n
      FROM market.mv_district_recent r
      JOIN market.districts d ON d.id = r.district_id
      JOIN market.cities c ON c.id = d.city_id
      WHERE c.enabled AND NOT d.is_unknown AND r.type_group <> 'all'
      GROUP BY d.id, d.name, d.city_id, c.name, c.region
    )
    SELECT per.id, per.name, per.city_id, per.city, per.region, per.n FROM per WHERE per.k <= 2 ORDER BY per.city_n DESC, per.k LIMIT p_limit;
    RETURN;
  END IF;

  RETURN QUERY
  WITH q AS (SELECT market.normalize_ar(p_q) AS n),
  hits AS (
    SELECT d.id, d.name, d.name_norm, d.city_id
    FROM market.districts d JOIN market.cities c ON c.id = d.city_id, q
    WHERE c.enabled AND NOT d.is_unknown
      AND (d.name_norm LIKE '%' || q.n || '%' OR similarity(d.name_norm, q.n) > 0.4)
  )
  SELECT h.id, h.name, h.city_id, c.name, c.region, coalesce(sum(r.n_12m), 0)::bigint
  FROM hits h
  JOIN market.cities c ON c.id = h.city_id
  LEFT JOIN market.mv_district_recent r ON r.district_id = h.id AND r.type_group <> 'all'
  CROSS JOIN q
  GROUP BY h.id, h.name, h.name_norm, h.city_id, c.name, c.region, q.n
  ORDER BY (h.name_norm LIKE q.n || '%') DESC, coalesce(sum(r.n_12m), 0) DESC
  LIMIT p_limit;
END $$;

-- 024: district search across every enabled city, for the pricing page (the broker types the district, the city and
-- region come with it). Same matching as market.search_districts (005): normalised substring or trigram similarity,
-- names that start with the text first, then the busiest. Districts with no market deal are left out: they cannot be
-- priced from their own deals and only crowd the list (29k districts, most of them empty).
CREATE OR REPLACE FUNCTION market.search_districts_all(p_q text, p_limit int DEFAULT 12)
RETURNS TABLE (id int, name text, city_id int, city text, region text, n_market_deals bigint)
LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT market.normalize_ar(p_q) AS n),
  hits AS (
    SELECT d.id, d.name, d.name_norm, d.city_id
    FROM market.districts d JOIN market.cities c ON c.id = d.city_id, q
    WHERE c.enabled AND NOT d.is_unknown
      AND (d.name_norm LIKE '%' || q.n || '%' OR similarity(d.name_norm, q.n) > 0.4)
  )
  SELECT h.id, h.name, h.city_id, c.name, c.region, sum(m.n_deals)::bigint
  FROM hits h
  JOIN market.cities c ON c.id = h.city_id
  JOIN market.mv_district_month m ON m.district_id = h.id
  CROSS JOIN q
  GROUP BY h.id, h.name, h.name_norm, h.city_id, c.name, c.region, q.n
  ORDER BY (h.name_norm LIKE q.n || '%') DESC, sum(m.n_deals) DESC
  LIMIT p_limit;
$$;

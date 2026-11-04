-- refresh.sql — refresh every materialised view in the database, in dependency order (re-runnable).
-- The list is read from the catalog, not written down: a view added by a later migration is picked up automatically.
-- Order: a view that reads another materialised view (directly or through plain views) comes after it.
-- CONCURRENTLY (readers keep the old rows, no blocking) when the view is already populated and has a plain unique index;
-- a plain REFRESH the first time (an empty, never-populated view cannot be refreshed concurrently).
-- Each REFRESH is its own transaction (psql \gexec), market.mv_meta (the data date) last among equals.
\timing on

WITH RECURSIVE
edge AS (   -- relation -> relation its definition reads (views and materialised views)
  SELECT DISTINCT r.ev_class AS rel, d.refobjid AS ref
  FROM pg_rewrite r
  JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid AND d.refclassid = 'pg_class'::regclass
  WHERE d.refobjid <> r.ev_class
),
reach AS (  -- from each materialised view, walk through plain views until a table or another materialised view
  SELECT m.oid AS mv, e.ref FROM pg_class m JOIN edge e ON e.rel = m.oid WHERE m.relkind = 'm'
  UNION
  SELECT r.mv, e.ref FROM reach r JOIN pg_class v ON v.oid = r.ref AND v.relkind = 'v' JOIN edge e ON e.rel = v.oid
),
mvdep AS (  -- mv reads materialised view dep
  SELECT DISTINCT r.mv, r.ref AS dep FROM reach r JOIN pg_class c ON c.oid = r.ref AND c.relkind = 'm' WHERE r.ref <> r.mv
),
lvl AS (    -- longest chain of materialised views underneath
  SELECT oid AS mv, 0 AS depth FROM pg_class WHERE relkind = 'm'
  UNION ALL
  SELECT d.mv, l.depth + 1 FROM lvl l JOIN mvdep d ON d.dep = l.mv WHERE l.depth < 50
),
ordered AS (SELECT mv, max(depth) AS depth FROM lvl GROUP BY mv)
SELECT format('REFRESH MATERIALIZED VIEW %s%I.%I',
              CASE WHEN c.relispopulated AND EXISTS (
                     SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisunique AND i.indisvalid
                       AND i.indpred IS NULL AND i.indexprs IS NULL)
                   THEN 'CONCURRENTLY ' ELSE '' END,
              n.nspname, c.relname)
FROM ordered o JOIN pg_class c ON c.oid = o.mv JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (SELECT 1 FROM pg_depend x WHERE x.objid = c.oid AND x.deptype = 'e')   -- not owned by an extension
ORDER BY o.depth, (n.nspname = 'market' AND c.relname = 'mv_meta'), n.nspname, c.relname
\gexec

-- statistics for the planner on every materialised view
SELECT format('ANALYZE %I.%I', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'm' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1
\gexec

SELECT * FROM market.v_meta;

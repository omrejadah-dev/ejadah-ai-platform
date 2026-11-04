-- 016_legal_vectors.sql — meaning-based search for the legal assistant (PLAN.md phase E).
-- Keyword search alone found the right article in the top 6 for 14 of 64 broker-phrased questions: brokers say «المكيف خرب»,
-- the law says «الإصلاحات الضرورية للمأجور». Each article now also has a BGE-M3 vector, and search_meaning orders by meaning.
-- Source: tools/legal/embed_articles.py -> data/legal/article_vectors.csv, loaded by db/reload/04_legal.sql. Measure with: python tools/legal/eval_search.py --mode meaning
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE legal.articles ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- every keyword match with its rank and the share of the question's informative stems it contains (015's logic, unfiltered)
CREATE OR REPLACE FUNCTION legal.keyword_hits(q text)
RETURNS TABLE (article_id int, rank real, share real)
LANGUAGE sql STABLE AS $$
  WITH terms AS (
    SELECT DISTINCT t AS word FROM unnest(tsvector_to_array(to_tsvector('arabic', legal.norm(q)))) t
    WHERE t NOT IN (SELECT word FROM legal.common_terms) AND t NOT IN (SELECT word FROM legal.stop_words) AND length(t) > 1
  ), tq AS (
    SELECT to_tsquery('simple', string_agg(quote_literal(word), ' | ')) AS query, count(*) AS n_terms FROM terms
  )
  SELECT a.id, ts_rank_cd('{1.0, 0.4, 0.4, 0.3}', a.search, tq.query, 1),
         (SELECT count(*) FROM terms t WHERE a.search @@ to_tsquery('simple', quote_literal(t.word)))::real / tq.n_terms
  FROM legal.articles a, tq
  WHERE tq.query IS NOT NULL AND a.search @@ tq.query
$$;

-- keyword-only search, unchanged in behaviour: an article must contain 60% of the question's informative stems
CREATE OR REPLACE FUNCTION legal.search(q text, n int DEFAULT 6)
RETURNS TABLE (article_id int, document_id int, title text, label text, chapter text, text text, amendments jsonb, source_url text, rank real)
LANGUAGE sql STABLE AS $$
  SELECT a.id, d.id, d.title, a.label, a.chapter, a.text, a.amendments, d.source_url, h.rank
  FROM legal.keyword_hits(q) h JOIN legal.articles a ON a.id = h.article_id JOIN legal.documents d ON d.id = a.document_id
  WHERE h.share >= 0.6
  ORDER BY h.rank DESC, a.id
  LIMIT n
$$;

-- search by meaning: articles ordered by similarity to the question. Measured on the 64-question set (eval_search.py):
-- right article in the top 6 for 52-53 of 64, against 14 for keywords; merging the keyword ranking in only lowered that
-- (RRF with keyword weight 1: 44, 0.3: 46), and a cross-encoder reranker added ~16 s per question for +1, so neither is used.
-- An article is returned if it is close in meaning (similarity >= min_sim) or passes the keyword 60% rule, so a question
-- far from every article gets "nothing found". rank = similarity.
DROP FUNCTION IF EXISTS legal.search_hybrid(text, vector, int, real);
DROP FUNCTION IF EXISTS legal.search_hybrid(text, vector, int, real, real);
CREATE OR REPLACE FUNCTION legal.search_meaning(q text, qvec vector(1024), n int DEFAULT 6, min_sim real DEFAULT 0.50)
RETURNS TABLE (article_id int, document_id int, title text, label text, chapter text, text text, amendments jsonb, source_url text, rank real)
LANGUAGE sql STABLE AS $$
  WITH kw AS (SELECT h.article_id AS id FROM legal.keyword_hits(q) h WHERE h.share >= 0.6),
  cand AS (
    SELECT a.id, (1 - (a.embedding <=> qvec))::real AS sim, a.id IN (SELECT id FROM kw) AS kw_pass
    FROM legal.articles a WHERE a.embedding IS NOT NULL
  )
  SELECT a.id, d.id, d.title, a.label, a.chapter, a.text, a.amendments, d.source_url, c.sim
  FROM cand c JOIN legal.articles a ON a.id = c.id JOIN legal.documents d ON d.id = a.document_id
  WHERE c.sim >= min_sim OR c.kw_pass
  ORDER BY c.sim DESC, a.id
  LIMIT n
$$;


-- which search answered each question (meaning | keyword), for the admin panel's quality review
ALTER TABLE app.legal_questions ADD COLUMN IF NOT EXISTS search text;

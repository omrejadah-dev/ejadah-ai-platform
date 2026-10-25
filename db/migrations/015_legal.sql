-- 015_legal.sql — the legal assistant's library: one row per law, one row per article (PLAN.md phase E).
-- Source: tools/legal/fetch_boe.py + fetch_rega.py → build_csv.py → data/legal/legal_articles.csv
-- Search: PostgreSQL's Arabic stemmer on lightly normalised text, weighted law title > article label > chapter > text.
CREATE SCHEMA IF NOT EXISTS legal;

-- diacritics and tatweel out, alef forms unified; ة and ى stay (the Arabic stemmer handles them)
CREATE OR REPLACE FUNCTION legal.norm(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(regexp_replace(coalesce(t, ''), '[ً-ْـ]', '', 'g'), 'أإآٱ', 'اااا')
$$;

DROP TABLE IF EXISTS legal.articles;
DROP TABLE IF EXISTS legal.documents;
CREATE TABLE legal.documents (
  id          serial PRIMARY KEY,
  doc_key     text NOT NULL UNIQUE,
  title       text NOT NULL,
  authority   text NOT NULL,
  source_url  text NOT NULL
);
CREATE TABLE legal.articles (
  id          serial PRIMARY KEY,
  document_id int  NOT NULL REFERENCES legal.documents(id),
  seq         int  NOT NULL,                -- order in the law
  chapter     text NOT NULL DEFAULT '',
  label       text NOT NULL,                -- "المادة الخامسة عشرة"
  text        text NOT NULL,                -- as published (the original wording when the article was amended)
  amendments  jsonb NOT NULL DEFAULT '[]',  -- each amendment as published: decree, date, new wording
  search      tsvector,
  UNIQUE (document_id, seq)
);

CREATE TEMP TABLE stage (doc_key text, title text, authority text, source_url text, seq int, chapter text, label text, text text, amendments text);
COPY stage FROM '/data/legal/legal_articles.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

INSERT INTO legal.documents (doc_key, title, authority, source_url)
SELECT DISTINCT ON (doc_key) doc_key, title, authority, source_url FROM stage ORDER BY doc_key;

INSERT INTO legal.articles (document_id, seq, chapter, label, text, amendments)
SELECT d.id, s.seq, coalesce(s.chapter, ''), s.label, s.text, s.amendments::jsonb
FROM stage s JOIN legal.documents d USING (doc_key);

UPDATE legal.articles a SET search =
     setweight(to_tsvector('arabic', legal.norm(d.title)), 'A')
  || setweight(to_tsvector('arabic', legal.norm(a.label)), 'B')
  || setweight(to_tsvector('arabic', legal.norm(a.chapter)), 'C')
  || setweight(to_tsvector('arabic', legal.norm(a.text || ' ' || coalesce((SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(a.amendments) x), ''))), 'D')
FROM legal.documents d WHERE d.id = a.document_id;
CREATE INDEX ix_legal_articles_search ON legal.articles USING gin (search);

-- words that appear in more than 12% of articles ("في", "من", "نظام", "مادة"…) carry no signal: the Arabic stemmer
-- has no stop-word list, so they are measured and dropped from questions instead
DROP TABLE IF EXISTS legal.common_terms;
CREATE TABLE legal.common_terms AS
SELECT word FROM ts_stat('select search from legal.articles')
WHERE ndoc > 0.12 * (SELECT count(*) FROM legal.articles);

-- Arabic function words the stemmer keeps (it has no stop-word list): question words, pronouns, prepositions
DROP TABLE IF EXISTS legal.stop_words;
CREATE TABLE legal.stop_words AS
SELECT DISTINCT t AS word FROM unnest(tsvector_to_array(to_tsvector('arabic', legal.norm(
  'ما ماذا هل كيف متى كم اين لماذا من هو هي هم هن انا انت نحن هذا هذه ذلك تلك الذي التي الذين لي لك له لها عن الى على في مع او ثم لكن اذا ان لو قد كل بعض غير يجوز يمكن ابغى ابي اريد ودي ايش وش عندي سؤال'
)))) t;

-- top articles for a question: the question's informative stems, any of them may match (OR), ranked by cover density
-- with the article text weighted above chapter, label and law title; ties go to the earlier article.
-- An article must contain at least 60% of those stems: one shared word ("عقوبة") is not enough to call it relevant,
-- so an off-topic question gets "nothing found" instead of a confident-looking wrong article.
CREATE OR REPLACE FUNCTION legal.search(q text, n int DEFAULT 6)
RETURNS TABLE (article_id int, document_id int, title text, label text, chapter text, text text, amendments jsonb, source_url text, rank real)
LANGUAGE sql STABLE AS $$
  WITH terms AS (
    SELECT DISTINCT t AS word FROM unnest(tsvector_to_array(to_tsvector('arabic', legal.norm(q)))) t
    WHERE t NOT IN (SELECT word FROM legal.common_terms) AND t NOT IN (SELECT word FROM legal.stop_words) AND length(t) > 1
  ), tq AS (
    SELECT to_tsquery('simple', string_agg(quote_literal(word), ' | ')) AS query, count(*) AS n_terms FROM terms
  ), hits AS (
    SELECT a.id, ts_rank_cd('{1.0, 0.4, 0.4, 0.3}', a.search, tq.query, 1) AS rank,
           (SELECT count(*) FROM terms t WHERE a.search @@ to_tsquery('simple', quote_literal(t.word))) AS matched,
           tq.n_terms
    FROM legal.articles a, tq
    WHERE tq.query IS NOT NULL AND a.search @@ tq.query
  )
  SELECT a.id, d.id, d.title, a.label, a.chapter, a.text, a.amendments, d.source_url, h.rank
  FROM hits h JOIN legal.articles a ON a.id = h.id JOIN legal.documents d ON d.id = a.document_id
  WHERE h.matched * 5 >= h.n_terms * 3
  ORDER BY h.rank DESC, a.id
  LIMIT n
$$;

-- every question asked, for history, usage and quality review in the admin panel
CREATE TABLE IF NOT EXISTS app.legal_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  seat_id      uuid,
  question     text NOT NULL,
  answer       text NOT NULL,
  cited        int[] NOT NULL DEFAULT '{}',   -- legal.articles ids
  provider     text NOT NULL,
  duration_ms  int
);
CREATE INDEX IF NOT EXISTS ix_legal_questions_seat ON app.legal_questions (seat_id, created_at DESC);

SELECT (SELECT count(*) FROM legal.documents) AS laws, (SELECT count(*) FROM legal.articles) AS articles;

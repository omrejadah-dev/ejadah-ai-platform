-- 04_legal.sql — the legal library from data/legal/legal_articles.csv and its vectors from data/legal/article_vectors.csv.
-- An upsert on (doc_key) and (doc_key, seq): article ids are kept, because app.legal_questions.cited stores them, and so
-- are the stored embeddings of articles whose wording did not change (a changed article's embedding is cleared and then
-- filled from the vectors file; run tools/legal/embed_articles.py --changed first so that file matches the CSV).
-- Articles and laws no longer in the CSV are deleted (count in the report). All in one transaction.
\set articles_csv :datadir '/legal/legal_articles.csv'
\set vectors_csv  :datadir '/legal/article_vectors.csv'

CREATE TEMP TABLE stage (doc_key text, title text, authority text, source_url text, seq int, chapter text, label text, text text, amendments text);
COPY stage FROM :'articles_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
CREATE TEMP TABLE vec_stage (doc_key text, seq int, embedding vector(1024));
COPY vec_stage FROM :'vectors_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

BEGIN;
CREATE TEMP TABLE changed_docs (id int) ON COMMIT DROP;

WITH up AS (
  INSERT INTO legal.documents (doc_key, title, authority, source_url)
  SELECT DISTINCT ON (doc_key) doc_key, title, authority, source_url FROM stage ORDER BY doc_key
  ON CONFLICT (doc_key) DO UPDATE
    SET title = EXCLUDED.title, authority = EXCLUDED.authority, source_url = EXCLUDED.source_url
    WHERE (legal.documents.title, legal.documents.authority, legal.documents.source_url)
          IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.authority, EXCLUDED.source_url)
  RETURNING id, title
)
INSERT INTO changed_docs SELECT id FROM up;

-- the law title is part of every article's embedded passage
UPDATE legal.articles SET embedding = NULL WHERE document_id IN (SELECT id FROM changed_docs);

INSERT INTO legal.articles (document_id, seq, chapter, label, text, amendments)
SELECT d.id, s.seq, coalesce(s.chapter, ''), s.label, s.text, s.amendments::jsonb
FROM stage s JOIN legal.documents d USING (doc_key)
ORDER BY d.id, s.seq
ON CONFLICT (document_id, seq) DO UPDATE
  SET chapter = EXCLUDED.chapter, label = EXCLUDED.label, text = EXCLUDED.text, amendments = EXCLUDED.amendments,
      embedding = NULL
  WHERE (legal.articles.chapter, legal.articles.label, legal.articles.text, legal.articles.amendments)
        IS DISTINCT FROM (EXCLUDED.chapter, EXCLUDED.label, EXCLUDED.text, EXCLUDED.amendments);

DELETE FROM legal.articles a
WHERE NOT EXISTS (SELECT 1 FROM stage s JOIN legal.documents d USING (doc_key) WHERE d.id = a.document_id AND s.seq = a.seq);
DELETE FROM legal.documents d WHERE NOT EXISTS (SELECT 1 FROM stage s WHERE s.doc_key = d.doc_key);

UPDATE legal.articles a SET search =
     setweight(to_tsvector('arabic', legal.norm(d.title)), 'A')
  || setweight(to_tsvector('arabic', legal.norm(a.label)), 'B')
  || setweight(to_tsvector('arabic', legal.norm(a.chapter)), 'C')
  || setweight(to_tsvector('arabic', legal.norm(a.text || ' ' || coalesce((SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(a.amendments) x), ''))), 'D')
FROM legal.documents d WHERE d.id = a.document_id;

-- words in more than 12% of articles carry no signal (see 015)
DELETE FROM legal.common_terms;
INSERT INTO legal.common_terms (word)
SELECT word FROM ts_stat('select search from legal.articles')
WHERE ndoc > 0.12 * (SELECT count(*) FROM legal.articles);

UPDATE legal.articles a SET embedding = v.embedding
FROM vec_stage v JOIN legal.documents d ON d.doc_key = v.doc_key
WHERE a.document_id = d.id AND a.seq = v.seq AND a.embedding IS DISTINCT FROM v.embedding;
COMMIT;

ANALYZE legal.documents; ANALYZE legal.articles;
SELECT (SELECT count(*) FROM legal.documents) AS laws, (SELECT count(*) FROM legal.articles) AS articles,
       (SELECT count(*) FROM legal.articles WHERE embedding IS NOT NULL) AS with_vector,
       (SELECT count(*) FROM legal.common_terms) AS common_terms;

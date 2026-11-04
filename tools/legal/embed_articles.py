"""Meaning-based search for the legal assistant: one BGE-M3 vector per article (law title, article label, chapter, text, amendments).
Vectors are normalised, so cosine similarity is a dot product. Questions are embedded with the same model and no prefix (BGE-M3 needs none).
usage: tools/.venv/Scripts/python tools/legal/embed_articles.py [--changed]
  -> data/legal/article_vectors.csv (loaded by db/reload/04_legal.sql) and data/legal/article_vectors_src.csv (md5 of the
     passage each vector was built from). --changed re-embeds only articles that are new or whose passage changed and keeps
     the other vectors as they are; without it every article is embedded again (~6.5 min on CPU).
The first run downloads the model (~2.3 GB) into the Hugging Face cache.
"""
import csv, hashlib, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data/legal"
MODEL = "BAAI/bge-m3"
DIM = 1024
_model = None


def model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL, device="cpu")
        _model.max_seq_length = 2048   # the longest article is ~6,000 characters
    return _model


def encode(texts, batch_size=16):
    """Normalised vectors, one list of DIM floats per text."""
    return model().encode(texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=len(texts) > 50).tolist()


def passage(r):
    parts = [f"{r['title']} - {r['label']}", r["chapter"], r["text"]]
    parts += json.loads(r["amendments"] or "[]")   # the amended wording is what a broker will be asking about
    return "\n".join(p for p in parts if p)


def md5(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def previous():
    """(doc_key, seq) -> (passage md5, vector text) from the last run, when both files exist."""
    vec_f, src_f = ROOT / "article_vectors.csv", ROOT / "article_vectors_src.csv"
    if not (vec_f.exists() and src_f.exists()):
        return {}
    csv.field_size_limit(2**31 - 1)
    with open(src_f, encoding="utf-8") as f:
        src = {(r["doc_key"], r["seq"]): r["passage_md5"] for r in csv.DictReader(f)}
    with open(vec_f, encoding="utf-8") as f:
        return {(r["doc_key"], r["seq"]): (src[(r["doc_key"], r["seq"])], r["embedding"])
                for r in csv.DictReader(f) if (r["doc_key"], r["seq"]) in src}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    with open(ROOT / "legal_articles.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    t = time.time()
    hashes = [md5(passage(r)) for r in rows]
    old = previous() if "--changed" in sys.argv else {}
    vecs = [old[(r["doc_key"], r["seq"])][1] if old.get((r["doc_key"], r["seq"]), ("",))[0] == h else None
            for r, h in zip(rows, hashes)]
    todo = [i for i, v in enumerate(vecs) if v is None]
    for i, v in zip(todo, encode([passage(rows[i]) for i in todo]) if todo else []):
        vecs[i] = "[" + ",".join(f"{x:.6f}" for x in v) + "]"
    with open(ROOT / "article_vectors.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["doc_key", "seq", "embedding"])
        w.writerows([r["doc_key"], r["seq"], v] for r, v in zip(rows, vecs))
    with open(ROOT / "article_vectors_src.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["doc_key", "seq", "passage_md5"])
        w.writerows([r["doc_key"], r["seq"], h] for r, h in zip(rows, hashes))
    print(f"{len(rows)} articles ({len(todo)} embedded, {len(rows) - len(todo)} kept), {DIM} dims, {time.time() - t:.0f}s"
          f" -> {ROOT / 'article_vectors.csv'}")

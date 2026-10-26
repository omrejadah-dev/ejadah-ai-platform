"""Meaning-based search for the legal assistant: one BGE-M3 vector per article (law title, article label, chapter, text, amendments).
Vectors are normalised, so cosine similarity is a dot product. Questions are embedded with the same model and no prefix (BGE-M3 needs none).
usage: tools/.venv/Scripts/python tools/legal/embed_articles.py     -> data/legal/article_vectors.csv (loaded by 016_legal_vectors.sql)
The first run downloads the model (~2.3 GB) into the Hugging Face cache.
"""
import csv, json, sys, time
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


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    with open(ROOT / "legal_articles.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    t = time.time()
    vectors = encode([passage(r) for r in rows])
    with open(ROOT / "article_vectors.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["doc_key", "seq", "embedding"])
        for r, v in zip(rows, vectors):
            w.writerow([r["doc_key"], r["seq"], "[" + ",".join(f"{x:.6f}" for x in v) + "]"])
    print(f"{len(rows)} articles, {DIM} dims, {time.time() - t:.0f}s -> {ROOT / 'article_vectors.csv'}")

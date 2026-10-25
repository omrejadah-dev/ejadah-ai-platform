"""Merge the article files into one CSV for the database (db/migrations/015_legal.sql loads it from /data/legal/).
usage: python tools/legal/build_csv.py
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data/legal"
rows = []
for name in ("articles.jsonl", "articles_rega.jsonl"):
    rows += [json.loads(l) for l in (ROOT / name).read_text(encoding="utf-8").splitlines() if l.strip()]

with open(ROOT / "legal_articles.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["doc_key", "title", "authority", "source_url", "seq", "chapter", "label", "text", "amendments"])
    for r in rows:
        w.writerow([r["doc_key"], r["title"], r["authority"], r["source_url"], r["seq"], r["chapter"], r["label"],
                    r["text"], json.dumps(r["amendments"], ensure_ascii=False)])
print(f"{len(rows)} articles from {len({r['doc_key'] for r in rows})} laws -> {ROOT / 'legal_articles.csv'}")

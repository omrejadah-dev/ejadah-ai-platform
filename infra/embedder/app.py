"""Question vectors for the legal assistant's search by meaning (PLAN.md phase E), run next to the API on the same server.
  POST /embed  {"texts": [...]}  -> {"vectors": [[1024 floats], ...]}   BGE-M3, normalised (same as tools/legal/embed_articles.py)
  GET  /health
CPU only. The API falls back to keyword search whenever this service is slow or down.
A cross-encoder reranker was measured and left out: ~16 s per question for one more right article in 64.
"""
import os, threading

import torch
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

torch.set_num_threads(int(os.environ.get("TORCH_THREADS", "4")))
EMBED_MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-m3")

embedder = SentenceTransformer(EMBED_MODEL, device="cpu")
embedder.max_seq_length = 512          # questions are short; articles are embedded offline with a longer limit
lock = threading.Lock()                # one model call at a time: parallel calls only fight over the same cores

app = FastAPI(title="ejadah-embedder")


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


@app.get("/health")
def health():
    return {"status": "ok", "model": EMBED_MODEL}


@app.post("/embed")
def embed(req: EmbedRequest):
    with lock:
        vectors = embedder.encode(req.texts, normalize_embeddings=True).tolist()
    return {"vectors": vectors}

# CPU-only model service for the legal assistant's meaning-based search. Models download on first start into the hf-cache volume.
FROM python:3.12-slim
WORKDIR /app
# same versions the search was measured with (tools/.venv)
RUN pip install --no-cache-dir torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir sentence-transformers==6.2.0 fastapi==0.115.6 "uvicorn[standard]==0.34.0"
COPY app.py .
ENV HF_HOME=/models
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

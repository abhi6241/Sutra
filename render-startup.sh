#!/usr/bin/env bash
# render-startup.sh — Render web service start command.
#
# Seeds the database if it doesn't exist, then starts the API server.
# Render's persistent disk preserves data/campus.db across deploys,
# so seeding only runs on first boot or after a disk wipe.

set -euo pipefail

# Seed database if missing (first boot or disk wipe)
if [ ! -f /app/data/campus.db ]; then
  echo "Seeding campus database..."
  python scripts/seed.py
fi

# Seed ChromaDB RAG collection if missing
if [ ! -d /app/chroma_db ] || [ -z "$(ls -A /app/chroma_db 2>/dev/null)" ]; then
  echo "Ingesting policy documents into ChromaDB..."
  python -c "from apps.api.rag.ingest_docs import ingest_all; ingest_all()" 2>/dev/null || echo "RAG ingestion skipped (non-fatal)"
fi

echo "Starting VasaviHub backend on port ${PORT:-8000}..."
exec uvicorn apps.api.main:app --host 0.0.0.0 --port "${PORT:-8000}"

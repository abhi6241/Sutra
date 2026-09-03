# Render Deployment

How to deploy the VasaviHub backend to Render.

## Quick Deploy

### 1. Push to GitHub

```bash
git add render.yaml render-startup.sh apps/api/main.py
git commit -m "Add Render deployment config"
git push
```

### 2. Create a Render Blueprint

1. Go to [render.com/blueprints](https://render.com/blueprints)
2. Click **New Blueprint Instance**
3. Connect your GitHub repository
4. Render detects `render.yaml` and provisions:
   - A **Web Service** (`vasavihub-backend`) on Python 3.11
   - A **1 GB persistent disk** mounted at `/app/data`
5. Set environment variables in the Render dashboard (see below)
6. Click **Apply**

### 3. Set Environment Variables

In the Render dashboard, go to **Environment** and add:

| Variable | Required | Value |
|----------|----------|-------|
| `GROQ_API_KEY` | Yes | Your Groq API key |
| `VASAVIHUB_CORS_ORIGINS` | Yes | `https://your-frontend.vercel.app,http://localhost:5173` |
| `GEMINI_API_KEY` | No | Gemini fallback key |
| `ANTHROPIC_API_KEY` | No | Anthropic fallback key |
| `OPENAI_API_KEY` | No | OpenAI fallback key |
| `OLLAMA_DISABLE` | Yes | `1` (Ollama not available on Render) |

### 4. Verify

```bash
curl https://your-app.onrender.com/health
# → {"status":"ok"}
```

## How It Works

### Startup Sequence (`render-startup.sh`)

1. **Check if `data/campus.db` exists** — if not, runs `scripts/seed.py`
2. **Check if ChromaDB is populated** — if not, ingests policy documents
3. **Start uvicorn** on the port Render assigns (`$PORT`)

The persistent disk at `/app/data` preserves the database across deploys and restarts.

### Build vs Runtime

| Phase | What Happens |
|-------|-------------|
| **Build** | `pip install -r requirements.txt` |
| **Runtime** | Seed DB if missing → Ingest RAG if missing → Start uvicorn |

Database seeding runs at **first boot**, not at build time. This means:
- The disk persists data across deploys
- A new deploy doesn't wipe the database
- Manual re-seeding: delete the disk contents or restart the service

## CORS Configuration

The backend now reads CORS origins from `VASAVIHUB_CORS_ORIGINS`:

```python
# apps/api/main.py
_cors_origins = os.environ.get("VASAVIHUB_CORS_ORIGINS", "http://localhost:5173")
```

For a Vercel frontend + Render backend:

```
VASAVIHUB_CORS_ORIGINS=https://your-project.vercel.app,http://localhost:5173
```

## Persistent Disk

The `render.yaml` provisions a **1 GB disk** at `/app/data`:

| File | Purpose |
|------|---------|
| `data/campus.db` | Campus database (40 students, 8 companies, 12 events) |
| `data/memory.db` | Student memory (durable facts + semantic summaries) |
| `data/checkpoints.db` | LangGraph thread state (approval resume) |

The disk persists across:
- Service restarts
- Deploys
- Render dyno cycling

It does NOT persist if you:
- Delete the service
- Manually delete the disk in the dashboard

## Re-seeding the Database

To wipe and rebuild the database on Render:

```bash
# Via Render Shell (dashboard → Shell)
cd /app
rm -f data/campus.db data/memory.db data/checkpoints.db
rm -rf chroma_db/
python scripts/seed.py
# Restart the service
```

Or simply **restart the service** — the startup script re-seeds if `campus.db` is missing.

## Plan Recommendations

| Plan | RAM | CPU | Disk | Notes |
|------|-----|-----|------|-------|
| **Free** | 512 MB | Shared | — | May be too little for ChromaDB + embeddings |
| **Starter** | 512 MB | Shared | 1 GB | Minimum for production use |
| **Standard** | 2 GB | Shared | 1 GB | Recommended — enough for warm-up |
| **Pro** | 4 GB+ | Dedicated | 1 GB | For heavy concurrent use |

**Minimum:** Starter plan with 1 GB disk. The embedding model and ChromaDB need at least 512 MB of free RAM.

## Connecting Frontend

### Vercel

1. Deploy frontend to Vercel (see [VERCEL.md](VERCEL.md))
2. Set `VITE_API_URL` to your Render backend URL
3. Set `VASAVIHUB_CORS_ORIGINS` on Render to include the Vercel URL

### Local Development

```bash
# Backend on Render, frontend locally
cd apps/web
VITE_API_URL=https://your-app.onrender.com npm run dev
```

## Files Created

| File | Purpose |
|------|---------|
| `render.yaml` | Render Blueprint — web service + persistent disk |
| `render-startup.sh` | Startup script — seeds DB, starts uvicorn |
| `apps/api/main.py` | Updated — configurable CORS via `VASAVIHUB_CORS_ORIGINS` |

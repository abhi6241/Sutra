# Vercel Deployment

How to deploy VasaviHub to Vercel.

## Architecture

Vercel deploys the **frontend only** (static Vite/React). The **backend** must run separately because it uses SQLite, ChromaDB, and LangGraph checkpoints — none of which work in Vercel's serverless environment.

```
Vercel (frontend)  ──rewrite──►  External backend (Railway / Fly.io / VPS)
   port 443                          port 8000
```

## Frontend Deployment

### Option 1: Deploy from Monorepo Root

```bash
vercel --prod
```

Vercel auto-detects the `vercel.json` at the repo root. Set the **Root Directory** to `apps/web` in the Vercel dashboard if it doesn't auto-detect.

### Option 2: Deploy the Whole Monorepo (recommended)

```bash
vercel --prod
```

from the repo root. The only Vercel config file is the root `vercel.json`; it builds `apps/web` via `npm install --prefix apps/web && npm run build --prefix apps/web` and serves `apps/web/dist`. There is **no** `apps/web/vercel.json`, so deploying with the dashboard's Root Directory pointed at `apps/web` will fall back to auto-detection instead of this config.

### Vercel Dashboard Settings

| Setting | Value |
|---------|-------|
| Framework Preset | Vite (or "Other" — the root `vercel.json` decides the build) |
| Root Directory | repo root (leave empty) |
| Build Command | from `vercel.json` (`cd ../.. && npm install --prefix apps/web && npm run build --prefix apps/web`) |
| Output Directory | `apps/web/dist` |
| Install Command | `npm install` |

## Environment Variables

Set these in the Vercel dashboard under **Settings → Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | Backend URL baked in as the `__API_URL__` build constant (`apps/web/vite.config.ts`) |

Note: the frontend's fetch layer (`apps/web/src/transport/sseClient.ts`) currently uses **relative URLs** — `VITE_API_URL` is not consumed at runtime, and the rewrites below handle routing to the backend. In local dev, `vite.config.ts` also proxies the same paths to `http://localhost:8000`.

## API Proxying

Vercel rewrites in `vercel.json` proxy these paths to the backend:

| Frontend Path | Proxied To |
|---------------|-----------|
| `/chat` | Backend `/chat` |
| `/approve` | Backend `/approve` |
| `/health` | Backend `/health` |
| `/inbox/*` | Backend `/inbox/*` |
| `/calendar/*` | Backend `/calendar/*` |
| `/admin/*` | Backend `/admin/*` |
| `/stream/*` | Backend `/stream/*` (SSE) |

The `/stream` rewrite includes headers to prevent buffering (`Cache-Control: no-cache`, `X-Accel-Buffering: no`).

## Backend Deployment (Separate)

The backend cannot run on Vercel. Deploy it to one of:

### Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and init
railway login
railway init

# Set environment variables
railway variables set GROQ_API_KEY=your_key_here

# Deploy
railway up
```

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and launch
fly auth login
fly launch

# Set secrets
fly secrets set GROQ_API_KEY=your_key_here

# Deploy
fly deploy
```

### Any VPS (DigitalOcean, AWS EC2, etc.)

```bash
# SSH into the server
ssh user@your-server

# Clone and setup
git clone <repo-url>
cd VCEHub
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed.py

# Run with a process manager
pip install gunicorn
gunicorn apps.api.main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

## CORS Configuration

Set the `VASAVIHUB_CORS_ORIGINS` environment variable on the backend — the app reads it at startup (`apps/api/main.py`) and defaults to `http://localhost:5173`:

```
VASAVIHUB_CORS_ORIGINS=https://your-project.vercel.app,http://localhost:5173
```

## Connecting Frontend to Backend

1. Deploy the backend to Railway/Fly.io/VPS
2. Note the backend URL (e.g., `https://your-app.up.railway.app`)
3. Set `VASAVIHUB_CORS_ORIGINS` on the backend to include the Vercel frontend domain
4. Redeploy both services (the frontend needs no code change — all API calls use relative URLs and the rewrites do the routing)

## Local Development (No Vercel)

Vercel config files don't affect local development. The Vite dev server proxy still works:

```bash
cd apps/web
npm run dev  # Proxies to localhost:8000
```

## Limitations

| Limitation | Reason |
|------------|--------|
| Backend not on Vercel | SQLite, ChromaDB, LangGraph checkpoints require persistent filesystem |
| SSE through rewrites | Vercel rewrites proxy SSE, but may buffer on free tier |
| No WebSocket support | Vercel doesn't support persistent WebSocket connections |
| Cold starts | Free tier has cold start delays; backend on Railway/Fly.io avoids this |
| File size limit | Vercel free tier: 4.5 MB per serverless function (not applicable — frontend only) |

## Files Created

| File | Purpose |
|------|---------|
| `vercel.json` | Root Vercel config (monorepo — builds `apps/web`, API rewrites) |
| `.vercelignore` | Exclude backend/tests/scripts from Vercel build |

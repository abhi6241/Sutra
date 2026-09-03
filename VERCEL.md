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

### Option 2: Deploy from apps/web

```bash
cd apps/web
vercel --prod
```

Uses `apps/web/vercel.json`.

### Vercel Dashboard Settings

| Setting | Value |
|---------|-------|
| Framework Preset | Vite |
| Root Directory | `apps/web` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

## Environment Variables

Set these in the Vercel dashboard under **Settings → Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | Backend URL (e.g., `https://your-backend.up.railway.app`) |

If `VITE_API_URL` is not set, API calls go to the same origin (Vercel rewrites proxy to the backend).

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
cd vasavihub-main
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed.py

# Run with a process manager
pip install gunicorn
gunicorn apps.api.main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

## CORS Configuration

After deploying the backend, update `apps/api/main.py` to allow your Vercel frontend domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://your-project.vercel.app",  # Add this
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Or set the `VASAVIHUB_CORS_ORIGINS` environment variable (if you add support for it).

## Connecting Frontend to Backend

1. Deploy the backend to Railway/Fly.io/VPS
2. Note the backend URL (e.g., `https://your-app.up.railway.app`)
3. In Vercel dashboard, set `VITE_API_URL` to the backend URL
4. Update backend CORS to allow the Vercel domain
5. Redeploy both services

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
| `vercel.json` | Root Vercel config (monorepo) |
| `apps/web/vercel.json` | Standalone frontend Vercel config |
| `.vercelignore` | Exclude backend/tests/scripts from Vercel build |
| `apps/web/vite.config.ts` | Updated with `VITE_API_URL` support |

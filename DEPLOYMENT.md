# Deployment

Deployment documentation for the VasaviHub Smart Campus system.

## Deployment Options

| Option | Frontend | Backend | Guide |
|--------|----------|---------|-------|
| Local development | Vite dev server (port 5173) | Uvicorn (port 8000) | [RUN.md](RUN.md) |
| Docker | Nginx container (port 80) | Python container (port 8000) | [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml) |
| Vercel + Render | Vercel static hosting | Render Web Service | [VERCEL.md](VERCEL.md), [RENDER.md](RENDER.md) |
| Vercel + Railway | Vercel static hosting | Railway service | [VERCEL.md](VERCEL.md) |

## Vercel (Frontend)

Frontend-only deployment to Vercel. Backend runs separately.

```bash
vercel --prod
```

Requires a separately deployed backend. See [VERCEL.md](VERCEL.md) for full instructions.

## Docker

```bash
docker compose up --build
```

Frontend on port 80, backend on port 8000. See [docker-compose.yml](docker-compose.yml).

## Vercel Configuration Files

## Build Process

### Backend

No build step required. The Python backend runs directly from source:

```bash
uvicorn apps.api.main:app --reload --port 8000
```

### Frontend

```bash
cd apps/web
npm run build       # Production build → dist/
npm run preview     # Preview production build locally
```

Vite produces optimized static files in `apps/web/dist/`.

### Standalone Bundle

```bash
cd apps/web
node scripts/build-standalone.mjs
```

Bundles the cockpit into a single self-contained HTML file for embedding in other pages.

## Production Configuration

### Not Present

The following are absent from the repository:
- `Dockerfile` / `docker-compose.yml`
- `.github/workflows/` or any CI/CD configuration
- `nginx.conf` or reverse proxy configuration
- `Makefile` or deployment scripts
- `systemd` service files
- Kubernetes manifests
- Terraform/infrastructure-as-code
- Environment-specific configuration files

### What Would Be Needed

For a production deployment, the following would be required:

1. **Reverse proxy** (nginx/Caddy) for HTTPS termination
2. **Process manager** (systemd, supervisord) for the Uvicorn worker
3. **Production database** (PostgreSQL recommended over SQLite for concurrency)
4. **Static file serving** for the built frontend
5. **CORS configuration** update for production domain
6. **Rate limiting** at the proxy or application level
7. **Logging** aggregation
8. **Monitoring** and health check integration

## Docker

**Not present.** No Dockerfile or docker-compose.yml exists.

A hypothetical Dockerfile would need:

```dockerfile
# Not from the repository — illustrative only
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN python scripts/seed.py
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Frontend Deployment

The frontend is a standard Vite React app. After `npm run build`, the `dist/` directory contains static files that can be served by any web server.

**CORS note:** The backend currently allows only `http://localhost:5173`. For production, this must be updated to the production frontend URL.

## Backend Deployment

The backend runs as a single Uvicorn process:

```bash
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
```

**Limitations for production:**
- SQLite does not support concurrent writes from multiple processes
- The `EventBus` is in-memory and not shared across workers
- The LLM router caches clients in module-level dict (not shared across workers)
- The chaos mode state is in-memory (not shared across workers)

## Database Deployment

### SQLite Files

| File | Purpose | Persistence |
|------|---------|-------------|
| `data/campus.db` | Campus data | Required across restarts |
| `data/memory.db` | Student memory | Required for cross-session memory |
| `data/checkpoints.db` | LangGraph state | Required for approval resume |
| `chroma_db/` | Vector store | Required for RAG |

All must be persistent volumes in any containerized deployment.

### Seeding

```bash
python scripts/seed.py    # Wipes and rebuilds campus.db
bash scripts/reset_demo.sh  # Wipes everything and re-seeds
```

## External Services

| Service | Purpose | Required |
|---------|---------|----------|
| Groq API | Primary LLM | Recommended (free tier) |
| Gemini API | LLM fallback | Optional |
| Ollama (local) | LLM fallback | Optional |
| Ollama Cloud | LLM fallback | Optional |
| Anthropic API | LLM fallback | Optional (paid) |
| OpenAI API | LLM fallback | Optional (paid) |

At minimum, one LLM provider must be configured, or `MOCK_LLM=1` must be set.

## Health Checks

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

The `/health` endpoint returns `{"status": "ok"}` when the server is running. It does not verify LLM connectivity, database availability, or Ollama reachability.

## Production Considerations

### Concurrency

- SQLite supports only one writer at a time
- The `EventBus` is per-process, not shared across workers
- LLM client caches are per-process
- For multiple workers, an external message bus (Redis, RabbitMQ) would be needed

### Memory

- ChromaDB stores vectors in memory + disk
- LangGraph checkpoints grow per thread
- The `CALL_COUNT` dict is per-process

### Timeouts

| Timeout | Default | Configurable |
|---------|---------|-------------|
| Per-provider HTTP | 25s | `LLM_TIMEOUT_S` |
| Whole LLM call | 20s | `LLM_CALL_TIMEOUT_S` |
| Graph leg | 60s | `GRAPH_LEG_TIMEOUT_S` |

### IPv6

Forced off by default. Set `ALLOW_IPV6=1` on networks with working IPv6.

## Deployment Limitations

1. **No containerization** — no Docker or docker-compose
2. **No CI/CD** — no automated testing or deployment pipeline
3. **No production database** — SQLite not suitable for concurrent production use
4. **No reverse proxy** — no HTTPS termination
5. **No process management** — no systemd, supervisord, or container orchestration
6. **No logging infrastructure** — no structured logging or log aggregation
7. **No monitoring** — no metrics, alerting, or observability
8. **No backup strategy** — no automated database backups
9. **Single-student UI** — frontend hardcodes student ID `1602-23-733-042`
10. **No load balancing** — single-process architecture

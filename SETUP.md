# Setup Guide

Step-by-step instructions for setting up the VasaviHub development environment.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | Required for `str | None` union syntax |
| Node.js | 20+ | For frontend build |
| pip | Latest | Python package manager |
| npm | 9+ | Node package manager |
| Git | Latest | Version control |

**Optional:**
- [Ollama](https://ollama.com) — for local LLM fallback (no API key needed)
- `qwen2.5:7b` model — `ollama pull qwen2.5:7b`

## Installation

### 1. Clone the Repository

```bash
git clone <repo-url>
cd VCEHub
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `fastapi`, `uvicorn[standard]` — backend framework
- `langgraph`, `langgraph-checkpoint-sqlite` — agent orchestration
- `chromadb`, `sentence-transformers` — vector store and embeddings
- `sqlalchemy` — database ORM
- `anthropic`, `google-genai`, `openai`, `groq`, `ollama` — LLM providers
- `pypdf`, `pandas` — document processing
- `python-dotenv` — environment variable loading
- `pytest`, `pytest-asyncio` — testing

### 3. Install Frontend Dependencies

```bash
cd apps/web
npm install
cd ../..
```

This installs:
- `react` 19, `react-dom` 19
- `zustand` — state management
- `@xyflow/react` — ReactFlow for DAG visualization
- `framer-motion` — animations
- `lucide-react` — icons
- `tailwindcss` v4, `@tailwindcss/vite` — styling
- `vite` 8, `typescript` 6, `vitest` — build/test tooling

### 4. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your API keys.

## Environment Variables

### Required (Recommended)

| Variable | Description | How to Get |
|----------|-------------|------------|
| `GROQ_API_KEY` | Groq API key — primary LLM provider | [console.groq.com](https://console.groq.com) |

### Optional (LLM Fallbacks)

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, ... | Additional Groq keys for rate limit rotation | — |
| `OLLAMA_API_KEY` | Ollama Cloud API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |

### Optional (Runtime Configuration)

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_DISABLE` | unset | Set `1` to skip Ollama entirely |
| `ALLOW_IPV6` | unset | Set `1` to enable IPv6 connections |
| `LLM_TIMEOUT_S` | `25` | Per-provider HTTP timeout in seconds |
| `LLM_CALL_TIMEOUT_S` | `50` | Whole-call deadline (all providers combined) |
| `GRAPH_LEG_TIMEOUT_S` | `60` | Outer deadline for one graph leg (initial run or resume) |
| `TURN_BUDGET_S` | `45` | Per-turn wall-clock budget used by planner/critic decisions |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model to use |
| `OLLAMA_LOCAL_MODEL` | `qwen2.5:7b` | Local Ollama model |
| `OLLAMA_CLOUD_MODEL` | `gpt-oss:20b-cloud` | Ollama Cloud model |
| `VASAVIHUB_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated CORS allow-list for the backend |

### Optional (LLM Models)

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_MODEL` | `gemini-flash-latest` | Hardcoded in `llm/router.py` |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Configurable |
| `OLLAMA_LOCAL_MODEL` | `qwen2.5:7b` | Configurable |
| `OLLAMA_CLOUD_MODEL` | `gpt-oss:20b-cloud` | Configurable |
| `ANTHROPIC_MODEL` | `claude-opus-4-8` | Hardcoded |
| `OPENAI_MODEL` | `gpt-4o-mini` | Hardcoded |

## Database Setup

### Seed the Campus Database

```bash
python scripts/seed.py
```

This creates `data/campus.db` with:
- 40 students (including 2 demo personas)
- 15 courses
- 8 companies (Google, Goldman Sachs, Microsoft, TCS, Infosys, Amazon, Deloitte, Bosch)
- 12 events (workshops, hackathon, club meets, career fair)
- 8 clubs
- V. Abhiram's timetable, attendance, and library loans
- 1 scholarship row

**The seed is deterministic** — every run wipes and rebuilds the database.

### Reset All Demo State

```bash
bash scripts/reset_demo.sh
```

This wipes:
- SQLite database (`data/campus.db`)
- LangGraph checkpoints (`data/checkpoints.db`)
- ChromaDB vector store (`chroma_db/`)
- Event fixtures (`fixtures/*.jsonl`)
- Memory store

Then re-seeds everything.

## Running Development Servers

### Backend

```bash
uvicorn apps.api.main:app --reload --port 8000
```

The backend starts on `http://localhost:8000`. On startup:
- The graph checkpointer is initialized from `data/checkpoints.db`
- LLM providers, Ollama, and the embedding model are warmed up in parallel

### Frontend

```bash
cd apps/web
npm run dev
```

The frontend starts on `http://localhost:5173`. Vite proxies API requests to `localhost:8000`.

### Running on Local Ollama (No API Keys)

```bash
# 1. Install Ollama — https://ollama.com
# 2. Pull the model the router expects locally
ollama pull qwen2.5:7b

# 3. Start the backend without any API keys
uvicorn apps.api.main:app --reload --port 8000
```

With unset API keys and `OLLAMA_DISABLE` unset, the router falls through to local Ollama. The planner also has deterministic keyword-based fallbacks for common read-only and conflict scenarios, so many goals plan correctly even while Ollama is cold-loading.

## Running Tests

### Backend Tests

```bash
pytest
```

Runs all 15 test files in `tests/` (plus the `conftest.py` re-seed fixture). Uses `asyncio_mode = auto`.

**Important:** Tests auto-seed `data/campus.db` before each module via the `conftest.py` fixture. The seed script is run automatically.

### Frontend Tests

```bash
cd apps/web
npm test
```

Runs Vitest tests: `i18n.test.ts`, `store.test.ts`, `runReducer.test.ts`, `pacing.test.ts`, `runScoreModel.test.ts`, `scoreLayout.test.ts`.

### Smoke Tests

```bash
# LLM + RAG sanity checks (needs a working LLM provider)
python smoke_test.py

# Graph mechanics with deterministic/no-network setup
python smoke_test_mock.py

# EventBus pub/sub
python smoke_test_bus.py

# Hero demo scenario
python smoke_test_hero.py

# Real graph execution
python smoke_test_graph.py

# Local Ollama only
python smoke_test_ollama_local.py
```

### End-to-End Check

```bash
python e2e_check.py
```

Verifies the full HTTP/SSE layer: POST /chat → GET /stream → approval → completion.

## Common Setup Errors

### "No LLM provider available"

Raised when every API key is unset **and** `OLLAMA_DISABLE=1`. Set at least one key, or leave Ollama enabled with the local model installed.

### Port 8000 already in use

```bash
lsof -ti:8000 | xargs kill -9
```

### Frontend can't reach backend

Verify CORS allows `http://localhost:5173`. The frontend must run on port 5173 (hardcoded in CORS config).

### IPv6 connection timeouts

The system forces IPv4 by default. Set `ALLOW_IPV6=1` if your network has working IPv6.

### SQLite database locked

The seed script handles this by dropping tables if the file can't be deleted (Windows). On other systems, stop the API server before re-seeding.

## Production Build

### Frontend

```bash
cd apps/web
npm run build
```

Produces optimized static files in `apps/web/dist/`.

### Standalone Bundle

```bash
cd apps/web
node scripts/build-standalone.mjs
```

Bundles the cockpit into a single self-contained HTML file for embedding.

## Generating Fixtures

```bash
# Record golden fixtures with mock LLM
python scripts/record_fixtures.py

# Record full capability verification fixture
python scripts/record_capability_fixture.py
```

Produces deterministic JSONL files in `fixtures/`. The frontend replay mode
reads `apps/web/public/fixtures/` — copy any changed golden files there
manually (the recorder does not sync them).

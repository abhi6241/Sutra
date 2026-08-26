# Running the Project

Step-by-step guide to get Sūtra running locally, including virtual environment setup.

## Prerequisites

- **Python 3.11+** — check with `python3 --version`
- **Node.js 20+** — check with `node --version`
- **pip** — comes with Python
- **npm** — comes with Node.js

## 1. Clone the Repository

```bash
git clone <repo-url>
cd sutra-main
```

## 2. Create and Activate a Virtual Environment

```bash
# Create the virtual environment
python3 -m venv .venv

# Activate it
# macOS / Linux:
source .venv/bin/activate

# Windows (PowerShell):
.venv\Scripts\Activate.ps1

# Windows (cmd):
.venv\Scripts\activate.bat
```

You should see `(.venv)` in your terminal prompt when active.

## 3. Install Python Dependencies

With the virtual environment active:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This installs all backend dependencies including FastAPI, LangGraph, ChromaDB, SentenceTransformers, and LLM provider SDKs.

## 4. Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` in your editor and add at least one API key:

```env
# Recommended — fast and free
GROQ_API_KEY=your_groq_api_key_here

# Optional fallbacks (leave blank to skip)
GEMINI_API_KEY=
OLLAMA_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

Get a free Groq API key at [console.groq.com](https://console.groq.com).

## 5. Seed the Campus Database

```bash
python scripts/seed.py
```

Creates `data/campus.db` with 40 students, 8 courses, 8 companies, 12 events, and the demo scenario data.

## 6. Start the Backend

```bash
uvicorn apps.api.main:app --reload --port 8000
```

The backend starts at `http://localhost:8000`. On first startup it warms up LLM connections and the embedding model — this may take 10-30 seconds.

Verify it's running:

```bash
curl http://localhost:8000/health
# → {"status":"ok"}
```

## 7. Install Frontend Dependencies (Second Terminal)

Open a **new terminal window** (keep the backend running):

```bash
cd apps/web
npm install
```

## 8. Start the Frontend

```bash
npm run dev
```

The frontend starts at `http://localhost:5173` and proxies API requests to the backend on port 8000.

## 9. Open the App

Navigate to **http://localhost:5173** in your browser.

---

## Running Without API Keys

Use the mock LLM for zero-network, deterministic testing:

```bash
MOCK_LLM=1 uvicorn apps.api.main:app --reload --port 8000
```

No API keys needed. The graph runs with pre-scripted responses. Good for:
- Trying the UI
- Frontend development
- Running tests

## Running with Ollama Only

If you prefer a fully local LLM with no external API calls:

```bash
# 1. Install Ollama — https://ollama.com
# 2. Pull the model
ollama pull qwen2.5:7b

# 3. Start the backend with only Ollama enabled
GROQ_API_KEY= GEMINI_API_KEY= uvicorn apps.api.main:app --reload --port 8000
```

## Running Tests

```bash
# Backend tests (with virtual environment active)
pytest

# Frontend tests
cd apps/web
npm test
```

## Stopping the Servers

Press `Ctrl+C` in each terminal to stop the frontend and backend.

To deactivate the virtual environment:

```bash
deactivate
```

## Full Reset

To wipe everything and start fresh:

```bash
bash scripts/reset_demo.sh
```

This deletes and re-seeds all databases, clears ChromaDB, and removes generated fixtures.

---

## Quick Reference

| Task | Command |
|------|---------|
| Activate venv | `source .venv/bin/activate` |
| Install deps | `pip install -r requirements.txt` |
| Seed database | `python scripts/seed.py` |
| Start backend | `uvicorn apps.api.main:app --reload --port 8000` |
| Start frontend | `cd apps/web && npm run dev` |
| Run backend tests | `pytest` |
| Run frontend tests | `cd apps/web && npm test` |
| Mock mode | `MOCK_LLM=1 uvicorn apps.api.main:app --reload --port 8000` |
| Full reset | `bash scripts/reset_demo.sh` |
| Health check | `curl http://localhost:8000/health` |

## Troubleshooting

### "No LLM provider available"

At least one API key must be set, or use `MOCK_LLM=1` for testing.

### Port 8000 already in use

```bash
# Find and kill the process using port 8000
lsof -ti:8000 | xargs kill -9
```

### Frontend can't reach backend

The backend CORS allows only `http://localhost:5173`. Make sure the frontend is running on port 5173 (the default Vite port).

### IPv6 connection timeouts

The system forces IPv4 by default. Set `ALLOW_IPV6=1` if your network requires it.

### ChromaDB or SQLite errors

Run `bash scripts/reset_demo.sh` to wipe and recreate all databases.

### "Module not found" errors

Make sure the virtual environment is activated (`source .venv/bin/activate`) before running any Python commands.

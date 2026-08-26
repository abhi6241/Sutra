# Sūtra — Smart Campus Multi-Agent Orchestrator

A multi-agent AI assistant for engineering college campuses, built for the **AgentX 2026 hackathon**. Sūtra answers student questions about academics, placements, events, campus services, and institutional policy documents using five specialist AI agents that run in parallel, with human-in-the-loop approval for any action that modifies records.

## Problem

College students navigate fragmented systems — separate portals for attendance, placement eligibility, event registration, library loans, and policy documents. Getting a single answer like *"Can I register for the placement workshop on Thursday?"* requires cross-referencing timetable data, attendance records, event capacity, placement criteria, and academic regulations across multiple systems. Sūtra unifies this into a single conversational interface backed by real campus data.

## Key Features

- **5 parallel specialist agents** — Academic, Placement, Events, Knowledge, and Services
- **24 registered campus tools** — timetable lookup, attendance checks, placement eligibility, event registration, RAG over policy documents, calendar/reminder management, and more
- **Human-in-the-loop approval** — write actions (event registration, grievance filing, email sending) pause for explicit student approval before execution
- **Deterministic conflict detection** — automatic schedule collision checks with attendance impact analysis before offering any registration
- **3-tier memory** — working (LangGraph thread state), profile (durable student facts in SQLite), and semantic (vector-recalled turn summaries in ChromaDB)
- **RAG over institutional documents** — clause-level citations from academic regulations, placement policy, library rules, hostel rules, and grievance SOP
- **Resilience layer** — automatic retry (x2), circuit breaker, and graceful degradation for each tool backed by a simulated service
- **Real-time SSE streaming** — every agent action, tool call, conflict, and approval request is streamed to the frontend as Server-Sent Events
- **Replay mode** — deterministic golden fixtures for demo playback without a running backend or LLM quota
- **Trilingual UI** — English, Hindi, and Telugu support
- **Presentation mode** — full-screen replay surface for projector demos

## How the System Works

1. A student sends a question via the chat interface
2. The **planner** agent decomposes the goal into a DAG of steps, each assigned to a specialist agent
3. The **dispatcher** runs independent steps in parallel
4. Each **specialist agent** selects exactly one tool, executes it, and composes a step result
5. A **conflict checker** verifies schedule collisions and attendance impact for any pending registrations
6. A **critic** evaluates whether the plan actually answered the question
7. An **approval gate** pauses the run for any write actions — the student approves, rejects, or edits each
8. A **synthesizer** composes the final answer from all step results
9. **Memory** is updated with durable facts and a turn summary after the answer

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend framework** | FastAPI (Python) |
| **Agent orchestration** | LangGraph (StateGraph with SQLite checkpointer) |
| **LLM providers** | Groq (primary), Gemini, Ollama (local/cloud), Anthropic, OpenAI — automatic fallback chain |
| **Embeddings** | SentenceTransformers (`all-MiniLM-L6-v2`) |
| **Vector database** | ChromaDB |
| **Structured database** | SQLite (via SQLAlchemy) |
| **Frontend framework** | React 19 + TypeScript 6 |
| **State management** | Zustand |
| **Visualization** | ReactFlow (`@xyflow/react`) for DAG, custom score timeline |
| **Styling** | TailwindCSS v4 |
| **Build tool** | Vite 8 |
| **Testing** | pytest (backend), Vitest (frontend) |
| **Linting** | oxlint (frontend) |

## Architecture

```
POST /chat → intake → planner → dispatch → [5 agents in parallel] → conflict_check → critic → approval_gate → synthesize → memory_write
                                                                                                                          ↓
GET /stream/{run_id} ← SSE stream of AgentEvents ← EventBus ←──────────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical architecture.

## Project Structure

```
sutra-main/
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── main.py             # Entrypoint: POST /chat, GET /stream, POST /approve
│   │   ├── bus.py              # EventBus — per-run pub/sub for AgentEvents
│   │   ├── graph/              # LangGraph pipeline
│   │   │   ├── build.py        # StateGraph wiring
│   │   │   ├── state.py        # GraphState TypedDict
│   │   │   ├── nodes.py        # All non-agent graph nodes
│   │   │   └── agents.py       # Specialist agent nodes (tool selection via LLM)
│   │   ├── llm/                # LLM provider router with fallback chain
│   │   ├── memory/             # 3-tier memory facade
│   │   ├── rag/                # RAG ingestion and retrieval
│   │   └── tools/              # 24 campus tools across 5 domains
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── App.tsx         # Root component
│       │   ├── components/     # UI components (DAG, score, approval, conversation)
│       │   ├── state/          # Zustand store + run reducer
│       │   └── transport/      # SSE client + replay source
│       └── package.json
├── packages/
│   └── contracts/              # Shared data contracts (Plan, Step, AgentEvent, PendingAction)
├── scripts/
│   ├── seed.py                 # Deterministic campus database seeder
│   ├── record_fixtures.py      # Golden JSONL fixture recorder
│   └── reset_demo.sh           # Wipes and re-seeds all demo state
├── data/
│   ├── schema.sql              # SQLite schema (18 tables)
│   └── *.md                    # 5 institutional policy documents (RAG corpus)
├── fixtures/                   # Golden JSONL event traces for replay
├── tests/                      # 20 pytest test files
├── engine.py                   # Legacy standalone backend (pre-multi-agent)
├── requirements.txt            # Python dependencies
└── .env.example                # API key template
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- (Optional) Ollama with `qwen2.5:7b` model for local LLM fallback

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd sutra-main

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys (at minimum GROQ_API_KEY for fast responses)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Recommended | Groq API key (fastest, free tier) |
| `GEMINI_API_KEY` | No | Google Gemini API key (fallback) |
| `OLLAMA_API_KEY` | No | Ollama Cloud API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (paid fallback) |
| `OPENAI_API_KEY` | No | OpenAI API key (paid fallback) |
| `MOCK_LLM` | No | Set `1` for zero-network deterministic testing |
| `OLLAMA_DISABLE` | No | Set `1` to skip Ollama entirely |

See [SETUP.md](SETUP.md) for the full list of environment variables.

## Running Locally

```bash
# 1. Seed the campus database
python scripts/seed.py

# 2. Start the backend (port 8000)
uvicorn apps.api.main:app --reload --port 8000

# 3. Start the frontend (port 5173)
cd apps/web && npm run dev
```

Open `http://localhost:5173` in your browser.

## Running with Mock LLM (No API Keys Needed)

```bash
MOCK_LLM=1 uvicorn apps.api.main:app --reload --port 8000
```

## Testing

```bash
# Backend tests
pytest

# Frontend tests
cd apps/web && npm test
```

## Docker

Not present in the repository. See [DEPLOYMENT.md](DEPLOYMENT.md).

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Start a new conversation turn |
| `GET` | `/stream/{run_id}` | SSE stream of agent events |
| `POST` | `/approve` | Approve/reject/edit a gated action |
| `GET` | `/inbox/{student_id}` | Student notification inbox |
| `GET` | `/calendar/{student_id}` | Student calendar projection |
| `POST` | `/admin/chaos` | Inject service failures for demo |
| `GET` | `/admin/chaos/status` | View chaos state |
| `POST` | `/admin/chaos/reset` | Reset all chaos modes |
| `GET` | `/health` | Health check |

See [API.md](API.md) for the complete API reference.

## Example Usage

**Ask about placement eligibility:**
> "Check if I'm eligible for Google SDE internship and register me for the placement workshop"

The system will:
1. Check your CGPA against Google's criteria (8.0 min, you have 8.4 — eligible)
2. Find the Placement Prep Workshop on Thursday and Saturday
3. Detect that Thursday collides with your DBMS Lab
4. Compute that attending would drop your attendance below 75%
5. Revise the plan to register for Saturday instead
6. Pause for your approval before registering
7. Add the event to your calendar after approval

## Known Limitations

- **No authentication** — student identity is passed as a request parameter, not verified
- **SQLite only** — not suitable for concurrent production use
- **No cancellation endpoint** — abandoned runs complete in the background
- **`tool.retry` / `tool.fallback` node attribution** — may carry the wrong `node_id` in parallel execution
- **IPv6 workaround** — outbound connections forced to IPv4 due to measured DNS resolution timeouts on the development network
- **No deployment configuration** — no Docker, CI/CD, or production deployment setup present

## License

Not specified in the repository.

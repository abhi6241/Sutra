# Developer Guide

How the codebase is organized and how to work on it.

## Repository Structure

```
sutra-main/
├── apps/
│   ├── api/                    # Python/FastAPI backend
│   │   ├── main.py             # FastAPI app, HTTP endpoints
│   │   ├── bus.py              # EventBus (asyncio.Queue pub/sub)
│   │   ├── graph/              # LangGraph pipeline
│   │   │   ├── build.py        # StateGraph wiring + graph_session()
│   │   │   ├── state.py        # GraphState TypedDict (285 lines)
│   │   │   ├── nodes.py        # All graph nodes (1364 lines — largest file)
│   │   │   └── agents.py       # Specialist agent nodes (438 lines)
│   │   ├── llm/
│   │   │   └── router.py       # LLM provider chain with fallback (690 lines)
│   │   ├── memory/
│   │   │   ├── __init__.py     # 3-tier memory facade
│   │   │   ├── profile.py      # Tier 2: durable facts in SQLite
│   │   │   └── semantic.py     # Tier 3: ChromaDB turn summaries
│   │   ├── rag/
│   │   │   ├── store.py        # Chunk → embed → ChromaDB
│   │   │   └── ingest_docs.py  # Policy document ingestion
│   │   └── tools/
│   │       ├── registry.py     # TOOL_REGISTRY — name → {fn, agent, ...}
│   │       ├── resilience.py   # @resilient decorator (retry + circuit breaker)
│   │       ├── chaos.py        # Fault injection for demo
│   │       ├── models.py       # Pydantic return models for all tools
│   │       ├── db.py           # SQLAlchemy engine/session
│   │       ├── receipts.py     # Shared receipt-writing helper
│   │       ├── academic.py     # 5 academic tools
│   │       ├── placement.py    # 4 placement tools
│   │       ├── events.py       # 4 event tools
│   │       ├── knowledge.py    # 2 RAG tools
│   │       └── services.py     # 9 service tools
│   └── web/                    # React/TypeScript frontend
│       ├── src/
│       │   ├── main.tsx        # React root mount
│       │   ├── App.tsx         # Root component (601 lines)
│       │   ├── i18n.ts         # Trilingual support (EN/HI/TE)
│       │   ├── state/
│       │   │   ├── store.ts    # Zustand store (381 lines)
│       │   │   └── runReducer.ts # Event → state reducer (408 lines)
│       │   ├── transport/
│       │   │   ├── sseClient.ts # SSE client (97 lines)
│       │   │   ├── replaySource.ts # Fixture replay (175 lines)
│       │   │   └── types.ts    # EventTransport interface
│       │   ├── components/     # UI components
│       │   ├── hooks/          # Custom React hooks
│       │   ├── layout/         # DAG layering algorithm
│       │   └── styles/         # CSS tokens + base styles
│       ├── scripts/
│       │   └── build-standalone.mjs  # Single-file HTML bundle
│       └── package.json
├── packages/
│   └── contracts/              # Shared data contracts
│       ├── plan.py             # Plan, Step, PLAN_JSON_INSTRUCTIONS
│       ├── events.py           # AgentEvent, EventType enum
│       └── actions.py          # PendingAction dataclass
├── scripts/
│   ├── seed.py                 # Campus database seeder (247 lines)
│   ├── record_fixtures.py      # Golden fixture recorder
│   ├── record_capability_fixture.py # Full capability fixture
│   ├── clean_memory.py         # Memory cleanup utility
│   └── reset_demo.sh           # Full demo reset
├── data/
│   ├── schema.sql              # SQLite schema (174 lines, 18 tables)
│   └── *.md                    # 5 institutional policy documents
├── fixtures/                   # 5 golden JSONL event traces
├── tests/                      # 20 pytest test files
├── docs/
│   └── BACKEND_CONTRACT.md     # Frontend integration guide (485 lines)
└── Root files: engine.py, smoke_test*.py, e2e_check.py, etc.
```

## Important Files by Role

### "Start Here" Files

| File | Why |
|------|-----|
| `apps/api/main.py` | All HTTP endpoints — the entry point for understanding request flow |
| `apps/api/graph/build.py` | The graph wiring — shows every node and edge |
| `apps/api/tools/registry.py` | All 24 tools mapped to agents |
| `packages/contracts/plan.py` | Plan/Step data model + the planner prompt instructions |
| `packages/contracts/events.py` | Event envelope used everywhere |

### Largest/Most Complex Files

| File | Lines | Why Complex |
|------|-------|-------------|
| `apps/api/graph/nodes.py` | 1364 | All non-agent graph nodes, conflict detection, synthesis |
| `apps/api/llm/router.py` | 690 | 5-provider fallback chain, Groq key rotation, mock LLM |
| `apps/api/tools/services.py` | 579 | 9 service tools |
| `apps/api/graph/agents.py` | 438 | Agent tool selection + composition |
| `packages/contracts/events.py` | 68 | EventType enum (25 types) |
| `apps/web/src/App.tsx` | 601 | Root component, all transport wiring |

## Coding Patterns

### Backend

- **LangGraph StateGraph** — all orchestration flows through `StateGraph(GraphState)`
- **Pydantic models** for API request/response and contract types (Plan, Step)
- **Dataclasses** for internal types (PendingAction, AgentEvent)
- **Async/await** throughout — `call_llm_async` wraps synchronous SDK calls in `asyncio.to_thread`
- **@resilient decorator** — wraps every tool with retry + circuit breaker + fallback
- **EventBus pattern** — all subsystems emit `AgentEvent` through `bus.emit()`; no direct frontend calls

### Frontend

- **Zustand store** — single global store, no Redux/context
- **Pure reducer** (`runReducer.ts`) — event stream folded into state via pure function
- **Transport abstraction** — `EventTransport` interface shared by live SSE and replay
- **Epoch tracking** — each transport callback captures its epoch to prevent stale updates
- **Inline styles** — most component styles are inline JavaScript objects (not CSS modules)

### Python Style

- Type hints throughout (`str | None`, `dict[str, Any]`)
- No `__all__` exports — modules export via `__init__.py` re-exports
- Docstrings on modules, not always on functions
- Comments explain *why*, not *what* — measured behaviors, not code descriptions

## Frontend Development Workflow

### Adding a New Component

1. Create `apps/web/src/components/YourComponent.tsx`
2. Follow existing patterns — see `ApprovalModal.tsx` or `InboxDrawer.tsx` for examples
3. Use `useStore()` to access global state
4. Use inline styles matching the existing design token system (`var(--accent)`, `var(--ink-900)`, etc.)

### Adding a New Event Type

1. Add the type to `EventType` enum in `packages/contracts/events.py`
2. Handle it in `runReducer.ts` to update `RunState`
3. Emit it from the appropriate graph node in `apps/api/graph/nodes.py`
4. Add UI rendering in the relevant component

### Working with the DAG Visualization

- `PlanCanvas.tsx` renders the ReactFlow DAG
- `StepNode.tsx` renders individual nodes with status icons
- `layerLayout.ts` computes deterministic left-to-right layering
- Layout is based on `depends_on` edges from the plan

### Running Frontend Tests

```bash
cd apps/web && npm test
```

Vitest runs: `i18n.test.ts`, `store.test.ts`, `runReducer.test.ts`, `pacing.test.ts`, `runScoreModel.test.ts`, `scoreLayout.test.ts`.

## Backend Development Workflow

### Adding a New Tool

1. Add the function to the appropriate file in `apps/api/tools/` (e.g., `academic.py`)
2. Return a Pydantic model from `apps/api/tools/models.py`
3. Register it in `TOOL_REGISTRY` in `apps/api/tools/registry.py`
4. Add it to `TOOL_SERVICE` mapping for chaos support
5. Set `requires_approval` and `required_role`
6. Write tests in `tests/test_tools.py`

### Adding a New Graph Node

1. Add the node function in `apps/api/graph/nodes.py`
2. Register it in `build_graph()` in `apps/api/graph/build.py`
3. Add it to `GraphState` if it needs new state fields
4. Wire conditional edges
5. Write tests in `tests/test_graph_control_flow.py`

### Adding a New Event Type

1. Add to `EventType` in `packages/contracts/events.py`
2. Emit from the appropriate node via `bus.emit(AgentEvent(...))`
3. Handle in `runReducer.ts` on the frontend

### Modifying the LLM Router

- Provider chain order is defined in `call_llm()` in `apps/api/llm/router.py`
- Each provider has its own `_call_*` function
- Mock LLM dispatches on substring matching in system prompts (`_mock_llm()`)
- **Warning:** Mock LLM is fragile — changing prompt wording breaks mock behavior

## Testing Conventions

- **Test isolation:** `conftest.py` re-seeds `campus.db` before each test module
- **Deterministic data:** Seed script uses `random.seed(42)` for reproducible data
- **Fixtures:** Golden JSONL files in `fixtures/` for regression testing
- **Mock mode:** `MOCK_LLM=1` for graph/dispatch mechanics without LLM calls
- **No external dependencies:** Tests use only SQLite, no real LLM calls

## Build/Lint/Format Commands

```bash
# Backend
pytest                          # Run all backend tests
python scripts/seed.py          # Re-seed database
python scripts/record_fixtures.py  # Record golden fixtures

# Frontend
cd apps/web
npm run dev                     # Dev server
npm run build                   # Production build
npm run lint                    # oxlint
npm run typecheck               # TypeScript check
npm test                        # Vitest
```

## Debugging

### Graph Stalls

Use `diag_graph.py` to run the graph with a 90s hard timeout, printing every bus event with elapsed timestamps:

```bash
python diag_graph.py
```

### LLM Call Count

Read `apps.api.llm.router.CALL_COUNT["total"]` to see how many LLM round-trips a run cost.

### Event Stream Issues

Check the recorded fixtures to verify expected event sequences:

```bash
python -c "import json; [print(json.loads(l)['type']) for l in open('fixtures/golden_conflict.jsonl')]"
```

## Git/Branch Conventions

Not discoverable from the repository. No `.github/`, `CONTRIBUTING.md`, or commit convention files exist.

## Cross-Session Testing

Two split-process tests verify state persistence:

- **`tests/memory_session_a.py`** / **`memory_session_b.py`** — A writes facts, B recalls them
- **`tests/checkpoint_session_a.py`** / **`checkpoint_session_b.py`** — A pauses at approval, B resumes

Run A first, let it complete, then run B.

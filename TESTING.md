# Testing

Documentation of the existing testing strategy.

## Testing Frameworks

| Framework | Language | Purpose | Config |
|-----------|----------|---------|--------|
| pytest | Python | Backend unit/integration tests | `pytest.ini` |
| pytest-asyncio | Python | Async test support | `asyncio_mode = auto` |
| Vitest | TypeScript | Frontend unit tests | `apps/web/package.json` |

## Test Structure

### Backend Tests (`tests/`)

| File | Lines | Focus |
|------|-------|-------|
| `conftest.py` | 40 | Module-scoped fixture: re-seeds `campus.db` before each test module |
| `test_tools.py` | 234 | All 24 tools across 5 agents |
| `test_bus.py` | 100 | EventBus pub/sub, late subscriber replay, fixture agreement |
| `test_call_efficiency.py` | 135 | LLM call count budget, summarizer accuracy, degraded flagging |
| `test_graph_control_flow.py` | 186 | Graph topology, replan caps, RESET reducer, demo ground truth |
| `test_approval_gating.py` | 195 | HITL gating, rejection, approved execution, idempotency |
| `test_resilience.py` | 106 | Chaos/retry/fallback, circuit breaker, domain refusal passthrough |
| `test_truthful_synthesis.py` | 293 | Final answer must not claim things that didn't happen |
| `test_conversational.py` | 165 | Greetings, capability questions, multi-turn state isolation |
| `test_calendar.py` | 51 | Calendar projection from timetable + approved events + reminders |
| `test_hero_conflict.py` | 162 | Hero demo conflict from real timetable data |
| `test_gap_fixes.py` | 114 | Atomic seat claim, role-scoped permissions, edited-approval validation |
| `test_llm_deadline.py` | 24 | Async LLM deadline releases the graph |
| `test_run_deadline.py` | 246 | Graph leg timeout, planner timeout, revision timeout |
| `test_rag.py` | 149 | RAG citations, attendance rule resolution, out-of-scope abstention |
| `memory_session_a.py` | — | Cross-session memory write (Process A) |
| `memory_session_b.py` | — | Cross-session memory recall (Process B) |
| `checkpoint_session_a.py` | — | Checkpoint durability write (Process A) |
| `checkpoint_session_b.py` | — | Checkpoint durability resume (Process B) |

**Total: 20 test files**

### Frontend Tests (`apps/web/src/`)

| File | Lines | Focus |
|------|-------|-------|
| `i18n.test.ts` | 39 | Trilingual `t()` function |
| `store.test.ts` | 40 | Zustand store operations |
| `runReducer.test.ts` | 230 | Event stream → state folding |
| `pacing.test.ts` | 57 | Replay pacing logic |
| `runScoreModel.test.ts` | 24 | Score model building from events |
| `scoreLayout.test.ts` | 26 | Score layout calculation |

**Total: 6 test files**

## Unit Tests

### Tool Tests (`test_tools.py`)

Tests all 24 tools with deterministic seed data:

- **Academic:** timetable lookup, attendance eligibility (DBMS Lab < 75%), schedule conflict detection
- **Placement:** Ananya eligible for Google (CGPA 8.4 >= 8.0), ineligible for Goldman (8.4 < 8.5), Rahul ineligible everywhere
- **Events:** search, capacity (Thursday has 2 seats), register (pending → approved), idempotency, seat overflow
- **Services:** hostel info, library loans, renew book, file grievance, draft/send email, calendar, reminder, escalate
- **LLM tolerance:** tools accept course names not just IDs, ignore filler/unknown categories

### Bus Tests (`test_bus.py`)

- Late subscriber replay (run finished before subscribe)
- Mid-run subscriber gets backlog + live events
- Two subscribers both get everything
- Fixture and stream agree

### Graph Control Flow Tests (`test_graph_control_flow.py`)

- All expected nodes present
- All agents funnel back through single dispatch node
- Two independent replan caps (MAX_REPLAN_ITERATIONS=2, MAX_REJECTION_REPLANS=1)
- RESET reducer works for step_results and pending_approvals
- Demo scenario ground truth

### Approval Gating Tests (`test_approval_gating.py`)

- `pending_approval` does NOT satisfy dependencies
- Dependent writes happen only AFTER approval
- Rejection writes nothing downstream
- Approved execution emits receipt
- Idempotency: registering twice doesn't consume two seats

### Resilience Tests (`test_resilience.py`)

- Healthy service passes through
- Error 500 → retry x2 → fallback to degraded
- Circuit opens after repeated failures
- Domain refusal (SeatsUnavailable) NOT swallowed as infrastructure fault
- Chaos status roundtrip

### Truthfulness Tests (`test_truthful_synthesis.py`)

- Rejected run never claims registration happened
- Approved run reports the receipt the stream recorded
- No citation marker without retrieval
- Action log survives replan
- Declined action never re-proposed

### Conversational Tests (`test_conversational.py`)

- Greetings get greetings (no eligibility verdict)
- Greetings run no agents at all
- Capability questions describe the system
- Thanks acknowledged differently from hello
- Real request still runs full pipeline
- Multi-turn: state doesn't leak between questions

### RAG Tests (`test_rag.py`)

- Citations carry title, number, clause, page
- 75% attendance rule resolves to R22 clause 4.2
- Condonation procedure resolves to clause 4.5
- Abstains on out-of-scope queries
- Knowledge agent emits real citations on the wire

## Integration Tests

### End-to-End (`e2e_check.py`)

Runs through the full HTTP/SSE layer:
1. POST /chat → GET /stream/{run_id} streams full event sequence
2. SSE payloads are byte-identical to fixtures
3. Approval gate fires and POST /approve resumes to completion
4. Chaos: placement service broken → tool.retry x2 → tool.fallback → degraded

### Cross-Session Memory (`memory_session_a.py` / `memory_session_b.py`)

- **A:** Writes preferences (morning classes, ML interest) to memory
- **B:** Recalls facts and semantic summaries from a cold process, verifying disk persistence

### Checkpoint Durability (`checkpoint_session_a.py` / `checkpoint_session_b.py`)

- **A:** Runs graph until approval interrupt, then exits (RAM dies)
- **B:** Resumes from `data/checkpoints.db` in a cold process, completing the run

## AI/ML Tests

### Call Efficiency (`test_call_efficiency.py`)

- Deterministic summarizer preserves exact numbers (8.4 CGPA, 70.3% attendance)
- Degraded results flagged clearly
- `_can_skip_compose` optimization (knowledge with citations skips LLM)
- Happy-path stays under 14-call budget

### LLM Deadline (`test_llm_deadline.py`)

- A blocking provider becomes a controlled step failure, not a permanent hang

### Run Deadline (`test_run_deadline.py`)

- Graph leg timeout emits terminal error
- Planner timeout finishes with conversational reply
- Revision timeout uses verified conflict-free event
- Known workflows don't depend on planner provider (deterministic planning)
- Critic routes pending write to human instead of replanning

## Test Configuration

### `pytest.ini`

```ini
[pytest]
asyncio_mode = auto
```

All async tests run automatically without `@pytest.mark.asyncio`.

### `conftest.py`

Module-scoped fixture that re-seeds `campus.db` before each test module:

```python
@pytest.fixture(autouse=True, scope="module")
def seed_campus_db():
    # Dispose existing engine
    # Run seed.py
    yield
```

## How to Run Tests

### Backend

```bash
# All tests
pytest

# Specific test file
pytest tests/test_tools.py

# With verbose output
pytest -v

# Stop on first failure
pytest -x
```

### Frontend

```bash
cd apps/web
npm test

# Watch mode
npx vitest
```

### Smoke Tests (Manual)

```bash
python smoke_test.py          # LLM + RAG basics
python smoke_test_mock.py     # Graph mechanics with mock LLM
python smoke_test_bus.py      # EventBus pub/sub
python smoke_test_hero.py     # Hero demo scenario
python smoke_test_graph.py    # Real graph execution
python smoke_test_ollama_local.py  # Local Ollama only
python e2e_check.py           # Full HTTP/SSE layer
```

## Coverage Configuration

**Not configured.** No `pytest-cov`, `vitest --coverage`, or coverage reporting is set up.

## Existing Test Gaps

1. **No coverage reporting** — cannot verify what percentage of code is tested
2. **No load/performance testing** — no concurrent user simulation
3. **No API contract testing** — no OpenAPI schema validation tests
4. **No frontend component tests** — only unit tests for pure logic (store, reducer, i18n)
5. **No E2E browser tests** — no Playwright, Cypress, or similar
6. **No security tests** — no injection, authentication bypass, or authorization tests
7. **No fixtures regression tests** — golden fixtures are recorded but not automatically compared against expected sequences in CI

## CI Test Execution

**Not configured.** No GitHub Actions, GitLab CI, or other CI/CD pipeline exists in the repository.

## Test Data Management

- **Deterministic seeding:** `random.seed(42)` in `seed.py` ensures reproducible data
- **Module-scoped fixtures:** `conftest.py` re-seeds before each test module for isolation
- **Demo personas:** Ananya Reddy and Rahul Verma have exact, documented properties
- **Golden fixtures:** 5 recorded JSONL files serve as regression baselines

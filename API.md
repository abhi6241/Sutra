# API Reference

Complete HTTP API documentation for the Sūtra backend.

**Base URL:** `http://localhost:8000`

**CORS:** Allows only `http://localhost:5173`.

---

## POST `/chat`

Start a new conversation turn. Returns a `run_id` for the event stream and a `thread_id` for conversation continuity.

**Authentication:** None.

**Request Body:**

```json
{
  "message": "Check my Google internship eligibility",
  "student_id": "1602-23-733-042",
  "role": "student",
  "thread_id": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `str` | Yes | The student's question or request |
| `student_id` | `str` | Yes | Roll number (e.g., `1602-23-733-042`) |
| `role` | `str` | No | `student` (default), `faculty`, or `admin` |
| `thread_id` | `str \| null` | No | Pass the returned `thread_id` from a previous turn to maintain conversation context |

**Response (200):**

```json
{
  "run_id": "a1b2c3d4e5f6",
  "thread_id": "f6e5d4c3b2a1"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | `str` | Unique per execution — subscribe to `/stream/{run_id}` |
| `thread_id` | `str` | Stable across the conversation — send back on next turn |

**Important:** `run_id` and `thread_id` are different. `run_id` scopes one execution and its event stream. `thread_id` scopes the conversation (checkpoint + memory).

---

## GET `/stream/{run_id}`

Server-Sent Events stream for a run. Replays all events emitted so far, then continues live.

**Do NOT use `EventSource`.** Use `fetch()` + `ReadableStream`. See `apps/web/src/transport/sseClient.ts` for a reference implementation.

**Query Parameters:** None.

**Response:** `text/event-stream` (SSE)

**Wire Format:**

```
event: node.started\n
data: {"id":"1d11e24a","run_id":"...","type":"node.started",...}\n
\n
```

Frames are separated by a blank line. Parse the `data:` line as JSON and ignore `event:` — the JSON already carries `type`. Buffer across chunk boundaries: a frame will get split mid-JSON.

**Event Envelope:**

Every event has all nine keys, always present:

```json
{
  "id": "1d11e24a",
  "run_id": "rec-5eb79856",
  "ts": 1786110035.56,
  "type": "node.started",
  "node_id": "s1",
  "agent": "placement",
  "payload": {},
  "latency_ms": null,
  "parent_id": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Unique per event — use for deduplication |
| `run_id` | `str` | The run this event belongs to |
| `ts` | `float` | Epoch **seconds** (not milliseconds) |
| `type` | `str` | Event type (see below) |
| `node_id` | `str \| null` | Plan step ID, or null for orchestration events |
| `agent` | `str \| null` | Emitter, or null |
| `payload` | `dict` | Type-specific data |
| `latency_ms` | `float \| null` | Only non-null on `node.finished` |
| `parent_id` | `null` | Always null |

**Event Types:**

| Type | Agent | Description |
|------|-------|-------------|
| `plan.created` | `planner` | The decomposed plan with steps |
| `plan.revised` | `planner` or `critic` | Plan changed (full plan) or critic objected (object with `satisfied: false`) |
| `node.started` | — | Step execution started |
| `agent.thinking` | specialist or `critic` | Agent is processing |
| `node.finished` | — | Step completed (includes `latency_ms`) |
| `node.failed` | — | Step failed (always followed by `node.finished` with `status: "error"`) |
| `tool.called` | — | Tool invoked with args |
| `tool.result` | — | Tool returned result |
| `tool.retry` | — | Tool retried after error |
| `tool.fallback` | — | Tool fell back to degraded mode |
| `rag.retrieved` | `knowledge` | RAG chunks retrieved with citations |
| `schedule.checked` | `academic` | Timetable collision check result |
| `attendance.impact.calculated` | `academic` | Attendance impact analysis |
| `conflict.detected` | `conflict_arbiter` | Schedule conflict found |
| `conflict.resolved` | `conflict_arbiter` | No conflicts found (fires on every clean pass) |
| `approval.requested` | `approval_gate` | Run blocked, awaiting human decision |
| `approval.resolved` | `approval_gate` | Human decision processed |
| `memory.recall` | `intake` | Memory loaded at start |
| `memory.write` | `memory` | Facts + summary written after answer |
| `run.finished` | `synthesizer` | Final answer + action ledger |
| `run.error` | — | Usually a warning (degradation notice), not fatal |

**History replay:** Connecting late is safe — the server replays everything already emitted, then continues live. Deduplicate on `event.id`.

---

## POST `/approve`

Approve, reject, or edit a gated action. Resumes the paused graph.

**Request Body:**

```json
{
  "run_id": "a1b2c3d4e5f6",
  "thread_id": "f6e5d4c3b2a1",
  "approval_id": "9d805fbc",
  "decision": "approve",
  "edited_args": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | `str` | Yes | Which event stream to keep writing to |
| `thread_id` | `str \| null` | No | Which checkpoint to resume (defaults to `run_id`) |
| `approval_id` | `str` | Yes | The `payload.id` from `approval.requested` |
| `decision` | `str` | Yes | `approve`, `reject`, or `edit` |
| `edited_args` | `dict \| null` | No | Modified tool args (only when `decision` is `edit`; only existing keys allowed) |

**Response (200):**

```json
{
  "status": "resuming"
}
```

**Important:**
- `approval_id` is forwarded so the gate resolves THE action the user acted on
- Only `register_event`, `file_grievance`, and `send_email` ever require approval
- Keep one approval in flight at a time

---

## POST `/admin/chaos`

Inject a service failure at runtime for demo purposes.

**Request Body:**

```json
{
  "service": "placement",
  "mode": "error_500"
}
```

| Field | Type | Allowed Values |
|-------|------|---------------|
| `service` | `str` | `erp`, `placement`, `events`, `rag`, `campus`, `library`, `comms`, `calendar` |
| `mode` | `str` | `healthy`, `slow`, `error_500`, `timeout`, `flaky`, `empty_response` |

**Response (200):**

```json
{
  "service": "placement",
  "mode": "error_500",
  "state": {"placement": "error_500"}
}
```

---

## GET `/admin/chaos/status`

View current chaos state.

**Response (200):**

```json
{
  "state": {"placement": "error_500"},
  "modes": ["healthy", "slow", "error_500", "timeout", "flaky", "empty_response"]
}
```

---

## POST `/admin/chaos/reset`

Reset all chaos modes to healthy.

**Response (200):**

```json
{
  "state": {}
}
```

---

## GET `/health`

Health check endpoint.

**Response (200):**

```json
{
  "status": "ok"
}
```

---

## GET `/inbox/{student_id}`

Get the student's notification inbox — campus alerts derived from current records.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `student_id` | `str` | Student roll number |

**Response (200):**

Returns `InboxResponse` with attention items (upcoming deadlines, overdue books, etc.).

**Error Responses:**
- `404` — Student not found

---

## GET `/calendar/{student_id}`

Get the student's authoritative calendar — verified timetable, approved event registrations, calendar writes, and reminders.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `student_id` | `str` | Student roll number |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | `str` | Start date (ISO format, optional) |
| `end` | `str` | End date (ISO format, optional) |

**Response (200):**

Returns `CalendarResponse` with merged calendar items from timetable, approved events, calendar writes, and reminders.

**Error Responses:**
- `400` — Invalid date format
- `404` — Student not found

---

## Internal Endpoints

The following endpoints are **not exposed** but exist in the codebase:

| Endpoint | Location | Purpose |
|----------|----------|---------|
| Graph checkpoint resume | `graph/build.py` | `AsyncSqliteSaver` handles state persistence |
| Memory read/write | `memory/__init__.py` | Called by `intake_node` and `memory_write_node` |
| RAG retrieval | `rag/store.py` | Called by Knowledge Agent |

## External APIs Consumed

| Provider | API | Purpose |
|----------|-----|---------|
| Groq | Chat completions | Primary LLM |
| Gemini | Content generation | LLM fallback |
| Ollama | Chat (local + cloud) | LLM fallback |
| Anthropic | Messages | LLM fallback |
| OpenAI | Chat completions | LLM fallback |

## Gotchas

1. **`EventSource` will not work** — use `fetch` + `ReadableStream`
2. **Deduplicate events by `event.id`** — history is replayed to new subscribers
3. **Deduplicate approvals by `payload.id`** — they are re-emitted on every resume
4. **`plan.revised` has two incompatible payloads** — branch on `payload.steps`
5. **`run.finished` is not the last event** — `memory.write` follows
6. **`run.error` is usually a warning** — only fatal when `agent` is `null` and no `detail`
7. **`conflict.resolved` means "none found"** — not "a conflict was fixed"
8. **`ts` is seconds**, not milliseconds. `latency_ms` is milliseconds
9. **`tool.result` for gated tools fires twice** — once as `pending_approval`, once after approval with real data
10. **`run_id` is per-turn, `thread_id` is per-conversation**

See [docs/BACKEND_CONTRACT.md](docs/BACKEND_CONTRACT.md) for the complete frontend integration guide.

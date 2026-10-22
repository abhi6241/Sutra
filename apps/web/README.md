# VasaviHub Web

The React/TypeScript frontend of the VasaviHub Smart Campus Orchestrator — the "cockpit" through which students chat with the multi-agent backend and watch runs execute live.

## What This App Does

- **Live mode** — connects to the Python/FastAPI backend via `POST /chat` and streams every orchestration event (`node.started`, `tool.called`, `approval.requested`, …) over SSE
- **Replay mode** — plays recorded golden fixtures from `public/fixtures/*.jsonl` with cinematic pacing, pause/resume/seek — no backend or LLM quota needed
- **Plan DAG** — the decomposed plan renders as a ReactFlow DAG (`@xyflow/react`) with per-step status
- **Run score** — a timeline visualization of the run, assembled from the event stream
- **Approval gate UI** — approve / reject / edit tool args when the backend pauses for human-in-the-loop
- **Inbox & calendar** — drawers wired to `GET /inbox/{student_id}` and `GET /calendar/{student_id}`
- **Trilingual UI** — English, Hindi, and Telugu (`src/i18n.ts`)

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + TypeScript |
| Build | Vite 8, TailwindCSS v4 (Vite plugin) |
| State | Zustand (`src/state/store.ts`) + pure run reducer (`src/state/runReducer.ts`) |
| DAG | `@xyflow/react` |
| Extras | framer-motion, lucide-react |
| Test / lint | Vitest, oxlint |

## Commands

```bash
npm install      # install dependencies
npm run dev      # dev server on port 5173 (proxies API to localhost:8000)
npm run build    # production build → dist/
npm run test     # Vitest (store, runReducer, i18n, pacing, runScoreModel, scoreLayout)
npm run lint     # oxlint
npm run typecheck
```

Single-file bundle for demos (replay-only, fully self-contained):

```bash
node scripts/build-standalone.mjs   # → dist-standalone/vasavihub.html
```

## Backend Integration

All API calls in `src/transport/sseClient.ts` use relative URLs; `vite.config.ts` proxies `/chat`, `/approve`, `/health`, `/inbox`, `/calendar`, `/admin`, and `/stream` to `http://localhost:8000` in dev.

**SSE note:** the stream is consumed with a manual `fetch` + `ReadableStream` reader, **not** `EventSource` — every frame is a named event and the stream terminates by socket close. Event folding into UI state happens through the pure reducer in `src/state/runReducer.ts`.

See [../../docs/BACKEND_CONTRACT.md](../../docs/BACKEND_CONTRACT.md) for the complete backend integration contract, and [../../ARCHITECTURE.md](../../ARCHITECTURE.md) for the frontend architecture section.

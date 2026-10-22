# Changelog

All notable changes to VasaviHub (formerly Sutra) are documented here.

## [Unreleased] — 2026-10

### Added
- **Token usage telemetry** — every successful LLM provider call emits a `token.usage` event (real usage where reported, chars/4 estimate flagged `"estimated": true`), surfaced in the UI Timeline and Telemetry rail.
- **CI** — GitHub Actions workflow running backend pytest and frontend lint/typecheck/test/build on every push and PR to `main`.
- **Deployment configs** — Render Blueprint (`render.yaml` + `render-startup.sh`), Vercel static frontend with API rewrites, Dockerfile + docker-compose, and configurable CORS / API URL for production.

### Changed
- **Mock LLM removed** — the router now always uses real providers (Groq → Ollama local/cloud → Gemini → Anthropic → OpenAI); determinism without a network comes from the planner's keyword fallbacks and the knowledge agent's direct RAG call.
- **Demo persona** — all seed data, tests, fixtures, and the default student switched from Ananya (CSE) to V. Abhiram (ECE, roll `1602-24-735-066`), with an ECE 5th-year timetable and attendance dataset.
- **Calendar projection** — invigilation lectures removed; only labs (and approved events/calendar writes) project onto the student calendar.

### Fixed
- Duplicate calendar writes when a replan re-runs a completed registration step.
- `.env` file now wins over stale shell environment variables (`load_dotenv(override=True)`).
- Deterministic `search_events` no longer fires for calendar-add requests, preventing wrong-tool selection.

### Docs
- Full documentation refresh across all 15 markdown files: provider chain and model defaults, `LLM_CALL_TIMEOUT_S = 50s`, removal of all `MOCK_LLM` claims, RAG collection names, deployment reality (Docker/CI/Nginx/CORS exist), test and seed counts, and a real frontend README.

## [Earlier] — 2026-09 and before

- Initial multi-agent ledger architecture: LangGraph planner/dispatch/conflict/critic/approval/synthesis pipeline, 24-tool registry, 3-tier memory, RAG over policy documents, SSE EventBus, and replay fixtures.
- UI overhaul: redesigned core layout and conversation experience, richer design-token system, and polished visualization components.

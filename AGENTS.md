# MediaCraft AI — Global Agent Rules & Guidelines

These instructions and rules are always active for this workspace and must be evaluated on every turn.

## 1. Interaction & Workflow Rules
- **Rule Awareness:** On every turn (including simple queries or greetings), always maintain active awareness of these project rules.
- **Documentation & Context Integrity:** Preserve codebase structure, maintain explicit typing, and adhere to Replit PNPM workspace conventions.

## 2. Core Architecture Rules
- **API Server & Express:**
  - Standard Express 5 ESM backend with `@types/express`.
  - Listeners must use `server.on("error", ...)` rather than passing an `err` parameter directly into `app.listen(port, callback)`.
- **Media Processing & FFmpeg:**
  - FFmpeg commands must be safely planned as JSON argument arrays with single `-i "__INPUT__"` and trailing `"__OUTPUT__"`.
  - Never execute commands through an unescaped shell.
  - Double-pass repair: on FFmpeg errors, send raw stderr back to Gemini 2.5 Flash for argument self-healing.
- **Frontend & UI (Stitch Studio):**
  - High-contrast Studio aesthetic (Studio Dark `#0d1117` & Editorial Light `#f8f9ff`).
  - Maintain the dual-pane Live Processing Studio, Bento Preset Cards, and Presets Library.
- **Integrations & Graceful Fallbacks:**
  - **Gemini AI (`GEMINI_API_KEY`):** Required for FFmpeg planning and self-healing.
  - **Parallel Search (`PARALLEL_API_KEY`):** Grounding with 2026 media specs; falls back cleanly if not provided.
  - **Grafana Cloud MCP (`GRAFANA_URL`, `GRAFANA_API_KEY`):** Streams self-healing & job telemetry; falls back to in-memory mode.
  - **ClickHouse Cloud (`CLICKHOUSE_URL`, `CLICKHOUSE_PASSWORD`):** Streams job logs to `mediacraft_jobs` table; falls back to in-memory store.

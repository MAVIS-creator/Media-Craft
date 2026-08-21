# MediaCraft AI

> A filmmaker-focused media studio that turns natural-language editing intent into validated FFmpeg workflows.

<p align="center">
  <img src="artifacts/media-craft-ai/public/media-craft-logo.png" alt="MediaCraft AI" width="420" />
</p>

<p align="center">
  Upload video or audio, describe the edit, and get a verified master with live AI and render diagnostics.
</p>

## What it does

MediaCraft AI is an agent-assisted media processing studio for filmmakers, editors, and production teams. It combines media inspection, natural-language planning, safe command generation, FFmpeg execution, and operational telemetry in one workflow.

- Upload video and audio files up to 4 GB.
- Inspect duration, format, streams, and codecs with `ffprobe` before processing.
- Choose filmmaker-oriented presets for social crops, audio extraction, subtitles, and compression.
- Describe custom edits in natural language.
- Use Gemini to generate a structured, validated FFmpeg argument array.
- Ground FFmpeg and codec decisions with Parallel Search.
- Run FFmpeg without a shell, using server-owned input/output paths.
- Send raw FFmpeg stderr back to Gemini for a bounded two-attempt repair.
- Preview verified video and audio outputs with branded controls.
- Download or share completed masters.
- Track live processing events, analytics, and provider diagnostics.
- Persist job analytics to ClickHouse Cloud and send job annotations to Grafana.

## Demo flow

1. Open the MediaCraft workspace.
2. Drop a `.mp4`, `.mov`, `.mxf`, `.wav`, or `.mp3` source file.
3. Select a preset or choose **Custom Gemini NL Macro**.
4. Enter an instruction such as:

   > Extract the audio, normalize the volume, and fade in over the first two seconds.

5. Start processing.
6. Watch the live event stream as MediaCraft validates the source, grounds the plan, runs FFmpeg, and verifies the output.
7. Preview, share, or download the master.

## Architecture

```text
React + Vite frontend
        │
        │ typed OpenAPI client
        ▼
Express API server
        │
        ├── ffprobe → source inspection
        ├── Gemini 2.5 Flash → JSON FFmpeg plan + bounded repair
        ├── Parallel Search API → technical grounding
        ├── FFmpeg → verified media output
        ├── ClickHouse Cloud → job analytics
        └── Grafana → job annotations and telemetry
```

### Important safety boundaries

- Gemini returns JSON with an `args` array, not a shell command.
- Exactly one server-owned `__INPUT__` placeholder and one final `__OUTPUT__` placeholder are required.
- User-controlled paths, shell syntax, extra inputs, and unsafe characters are rejected.
- Audio outputs explicitly reject video flags and visual filters.
- FFmpeg is executed with `spawn("ffmpeg", args)` and never through a shell.
- Repair is bounded to two attempts; the original source file is not modified.
- Provider failures are visible and fall back to the local session buffer where supported.

## Repository layout

```text
artifacts/
  api-server/              Express API, FFmpeg pipeline, provider integrations
  media-craft-ai/          React/Vite MediaCraft interface
lib/
  api-spec/                OpenAPI source of truth
  api-client-react/        Generated typed React hooks
  api-zod/                 Generated request/response schemas
scripts/                   Workspace and post-merge helpers
```

Key source files:

- `artifacts/media-craft-ai/src/App.tsx` — studio UI, settings, live processing, player
- `artifacts/media-craft-ai/src/index.css` — Stitch-inspired theme and responsive styling
- `artifacts/api-server/src/lib/media-processor.ts` — ffprobe, Gemini, FFmpeg, job lifecycle
- `artifacts/api-server/src/lib/gemini-ffmpeg.ts` — Gemini planning and argument validation
- `artifacts/api-server/src/lib/parallel-search.ts` — Parallel grounding and health status
- `artifacts/api-server/src/lib/clickhouse-mcp.ts` — ClickHouse analytics and diagnostics
- `artifacts/api-server/src/lib/grafana-mcp.ts` — Grafana health and job annotations
- `artifacts/api-server/src/routes/media.ts` — media, events, analytics, telemetry, diagnostics routes
- `lib/api-spec/openapi.yaml` — API contract used to generate clients and schemas

## Run locally

### Requirements

- Node.js 24+
- pnpm
- FFmpeg with `ffmpeg` and `ffprobe` available on `PATH`
- A Gemini API key for natural-language planning

### Install

```bash
pnpm install
```

### Configure

Copy `.env.example` as a reference and configure the values through Replit Secrets or your local environment. Never commit `.env` or paste credentials into source control.

Required for the full workflow:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Gemini FFmpeg planning and stderr repair |
| `PARALLEL_API_KEY` | Parallel Search grounding |
| `CLICKHOUSE_URL` | Full HTTPS ClickHouse Cloud endpoint |
| `CLICKHOUSE_USER` | ClickHouse username, normally `default` |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_DATABASE` | ClickHouse database, normally `default` |
| `GRAFANA_URL` | Grafana Cloud instance URL |
| `GRAFANA_API_KEY` | Grafana service-account token/API key |
| `GRAFANA_MCP_ENDPOINT` | Optional hosted Grafana MCP endpoint |

Gemini is required to create a job plan. Parallel, ClickHouse, and Grafana have explicit diagnostics and safe fallback behavior.

### Start the services

In one terminal:

```bash
pnpm --filter @workspace/api-server run dev
```

In a second terminal:

```bash
pnpm --filter @workspace/media-craft-ai run dev
```

The API listens on port `8080`. The Vite server uses the configured development port and is available through the Replit preview/workflow. The project already includes workflows for the API server and MediaCraft web app.

## Useful commands

```bash
# Full workspace typecheck
pnpm run typecheck

# Full typecheck and production build
pnpm run build

# API-only checks
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build

# Frontend-only checks
pnpm --filter @workspace/media-craft-ai run typecheck
pnpm --filter @workspace/media-craft-ai run build

# Regenerate typed clients after changing OpenAPI
pnpm --filter @workspace/api-spec codegen
```

## API endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/healthz` | API health check |
| `POST /api/media/jobs` | Upload and create a media job |
| `GET /api/media/jobs` | List session jobs |
| `GET /api/media/jobs/:id` | Get job status and media metadata |
| `GET /api/media/jobs/:id/events` | Read live processing events |
| `GET /api/media/jobs/:id/output` | Download a verified output |
| `GET /api/media/analytics` | Read session analytics |
| `GET /api/metrics/telemetry` | Read local pipeline telemetry |
| `GET /api/integrations/status` | Run sanitized Parallel, ClickHouse, and Grafana diagnostics |

## Testing the API manually

Create a small valid fixture with FFmpeg, submit it, and inspect the job:

```bash
ffmpeg -y \
  -f lavfi -i "color=c=navy:s=320x180:d=1" \
  -f lavfi -i "sine=frequency=440:duration=1" \
  -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac \
  /tmp/mediacraft-fixture.mp4

curl -X POST http://localhost:8080/api/media/jobs \
  -F "file=@/tmp/mediacraft-fixture.mp4;type=video/mp4" \
  -F "preset=extract-audio" \
  -F "prompt=Extract the audio as a clean MP3 master."
```

The event stream should identify source validation, Gemini planning, Parallel grounding, FFmpeg execution, output verification, and the analytics/telemetry providers.

## Google Cloud and partner runtime usage

- **Google Cloud:** `@google/genai` calls Gemini 2.5 Flash from the API server.
- **Parallel:** the API calls Parallel's Search API for FFmpeg and codec grounding.
- **ClickHouse:** completed job records are written to ClickHouse Cloud.
- **Grafana:** completed and failed jobs are sent as Grafana annotations, with health diagnostics exposed in the UI.
- **Replit:** the app is configured as a Replit artifact and is intended to be hosted directly on Replit.

For competition submissions, confirm that the exact partner track requirements are met. In particular, the current implementation uses ClickHouse and Grafana HTTPS APIs; the official rules state that the ClickHouse track requires `mcp-clickhouse` and the Grafana track checks active use of the official Grafana Cloud MCP server. The README cannot substitute for those runtime requirements.

## Hackathon submission readiness

The Google Cloud Agentic Cinema rules page requires:

- A hosted project URL for judging and testing.
- A public GitHub, GitLab, or Bitbucket repository.
- Source code, assets, and run instructions in that repository.
- A detectable open-source license.
- Runtime use of Google Cloud and any claimed partner services.
- A public demonstration video hosted on YouTube or Vimeo.
- A video no longer than three minutes, in English or with English subtitles.
- An English written submission covering features, technologies, data sources, findings, and learnings.

Current repository status:

- Repository documentation: included in this README.
- Open-source license: MIT, included in `LICENSE`.
- Google Gemini runtime call: implemented.
- Parallel Search runtime call: implemented and verified.
- ClickHouse runtime write: implemented and verified, but verify MCP-track compliance before claiming the ClickHouse track.
- Grafana runtime annotation: implemented and verified, but verify MCP-track compliance before claiming the Grafana track.
- Hosted URL: must be added to the Devpost submission after deployment.
- Demo video: must be recorded, uploaded publicly, and added to Devpost.
- Eligibility, originality, unpublished status, and submission ownership: must be confirmed by the entrant.

Rules reviewed: [Google Cloud Agentic Cinema Hackathon official rules](https://agentic-cinema.devpost.com/rules).

## License

MediaCraft AI is released under the MIT License. See [`LICENSE`](LICENSE).
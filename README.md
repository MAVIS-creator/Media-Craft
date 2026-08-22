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

## What it can create

MediaCraft is a media transformation and finishing tool. It can produce:

- **Video masters:** MP4 files, including vertical 9:16 reels, compressed web-ready video, subtitle-burned video, and custom FFmpeg edits.
- **Audio masters:** MP3 files extracted from video or transformed from supported audio sources.
- **Validated technical workflows:** Gemini creates the FFmpeg arguments while MediaCraft checks the media, runs the render, verifies the output, and repairs failed commands when possible.

MediaCraft does **not** currently generate entirely new video scenes, characters, images, or animations from text. It works with media that the user uploads and transforms that source using FFmpeg. It is also not a multi-track timeline editor or a permanent media-storage library; jobs are kept in server memory and temporary processing files.

## Supported operations

### Video

- Convert a source into a 9:16 vertical social reel.
- Crop and scale footage for a target presentation.
- Compress video into a web-ready H.264 MP4.
- Burn available subtitle or caption data into video.
- Preserve or transform audio alongside video.
- Apply custom edits described in natural language, subject to Gemini and FFmpeg validation.

### Audio

- Extract audio from video as MP3.
- Convert supported audio inputs into a verified MP3 master.
- Apply custom audio instructions such as fades, normalization, and format changes when FFmpeg supports the requested operation.

### Supported input extensions

`.mp4`, `.mov`, `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, and `.mxf`.

Uploads are limited to 4 GB. Every source is checked with `ffprobe` before Gemini creates a processing plan.

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

## Setup and development

This section is the standalone installation and run guide. It is intentionally focused on getting the repository running; the deeper processing model, API contract, preset behavior, and implementation notes remain in [`PROJECT.md`](PROJECT.md).

### 1. Prerequisites

Install or provision the following before starting:

- **Node.js 24 or newer.** The workspace is configured for the Node 24 runtime.
- **pnpm.** This repository is a pnpm workspace and intentionally rejects npm and Yarn installs.
- **FFmpeg and FFprobe.** Both `ffmpeg` and `ffprobe` must be available on `PATH`. FFmpeg is used to render media and FFprobe is used to inspect and validate uploads.
- **A Gemini API key** for custom natural-language processing, FFmpeg plan generation, caption generation, and bounded repair attempts.

Check the local tools:

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

On Replit, FFmpeg is declared as a Nix dependency in `.replit`, so a new Replit environment should provide both binaries automatically. On another Linux, macOS, or Windows machine, install FFmpeg using the operating system's package manager and confirm that both commands work before running the API.

### 2. Clone and install dependencies

Clone the repository and enter its root directory:

```bash
git clone <your-repository-url>
cd <repository-directory>
```

Install the complete workspace from the committed lockfile:

```bash
pnpm install --frozen-lockfile
```

The workspace contains the frontend, API server, generated API client/schema packages, database package, and shared tooling. Do not commit the generated `node_modules` directories; they are recreated by `pnpm install`.

If you are working directly in Replit, the dependencies are normally installed by the workspace environment. Run `pnpm install --frozen-lockfile` after importing the repository or whenever the lockfile changes.

### 3. Configure environment variables

Copy the example file for a traditional local setup:

```bash
cp .env.example .env
```

Open `.env` and replace every placeholder that you intend to use. The API reads environment variables from the process environment; it does not expose them to the browser. Never commit `.env`, API keys, service-account tokens, or passwords.

The API does not load `.env` automatically. Export the values into the current shell before starting it:

```bash
set -a
. ./.env
set +a
```

Alternatively, export only the values you need inline, for example:

```bash
PORT=8080 GEMINI_API_KEY=your_gemini_api_key_here \
  pnpm --filter @workspace/api-server run dev
```

For PowerShell, set the variables in the current session:

```powershell
$env:PORT = "8080"
$env:GEMINI_API_KEY = "your_gemini_api_key_here"
```

#### Environment variable reference

| Variable | Required? | Used for |
| --- | --- | --- |
| `PORT` | Yes for the API; optional for Vite | The API server port. Use `8080` for the documented local API URL. The frontend defaults to `3000` when no port is supplied. |
| `GEMINI_API_KEY` | Required for Custom Gemini NL Macro and generated captions | Gemini FFmpeg planning, raw-stderr repair, and caption generation. |
| `PARALLEL_API_KEY` | Optional | Technical search grounding for codec and FFmpeg decisions. Without it, the app uses its local technical context where supported. |
| `CLICKHOUSE_URL` | Optional | HTTPS ClickHouse Cloud endpoint for job analytics. `CLICKHOUSE_HOST` can also be used by the server as a legacy/alternate URL input. |
| `CLICKHOUSE_USER` | Optional with ClickHouse | ClickHouse username; normally `default`. |
| `CLICKHOUSE_PASSWORD` | Required only when ClickHouse is enabled | ClickHouse password. |
| `CLICKHOUSE_DATABASE` | Optional | ClickHouse database; normally `default`. |
| `GRAFANA_URL` | Optional | Grafana Cloud instance URL for health checks and annotations. |
| `GRAFANA_API_KEY` | Required only when Grafana is enabled | Grafana service-account token/API key with permission to create annotations and read health. |
| `GRAFANA_MCP_ENDPOINT` | Optional | Grafana MCP endpoint. Defaults to `https://mcp.grafana.com/mcp`. |
| `LOG_LEVEL` | Optional | API log level. Defaults to `info`. |
| `BASE_PATH` | Optional | Vite base path when hosting the frontend below a subpath. Defaults to `/`. |

The minimum useful local configuration is:

```dotenv
PORT=8080
GEMINI_API_KEY=your_gemini_api_key_here
```

`PARALLEL_API_KEY`, ClickHouse, and Grafana are observability/grounding integrations rather than prerequisites for the core local FFmpeg workflow. The Settings diagnostics screen reports the connection state of these providers.

#### Getting provider credentials

- **Gemini:** create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey). Keep it server-side; do not add it to frontend source code.
- **Parallel:** create an API key in the Parallel dashboard if technical web grounding is needed.
- **ClickHouse Cloud:** use the HTTPS URL, username, database, and password from the service details page.
- **Grafana Cloud:** use the base Grafana URL and a service-account token/API key with the required annotation permissions.

#### Replit environment setup

For a Replit deployment or shared Replit workspace, use the Secrets tool instead of creating a committed `.env` file:

1. Open the project **Secrets** panel.
2. Add `GEMINI_API_KEY`.
3. Add `PARALLEL_API_KEY` if Parallel grounding is enabled.
4. Add the ClickHouse variables if analytics is enabled.
5. Add `GRAFANA_URL` and `GRAFANA_API_KEY` if Grafana telemetry is enabled.
6. Add optional values such as `GRAFANA_MCP_ENDPOINT`, `CLICKHOUSE_DATABASE`, and `LOG_LEVEL` only when you need to override their defaults.
7. Restart the API workflow after changing a secret.

Do not paste secrets into chat, commit them to Git, or place them in `VITE_*` variables. Variables beginning with `VITE_` can be exposed to browser code; MediaCraft does not need provider credentials in the frontend.

### 4. Start the app

MediaCraft has two runtime services: the Express API and the React/Vite frontend. Start each in a separate terminal from the repository root.

**Terminal 1 — API server**

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

On Windows PowerShell:

```powershell
$env:PORT = "8080"
pnpm --filter @workspace/api-server run dev
```

The API performs a build and then starts on `http://localhost:8080`. A healthy startup prints a `Server listening` message.

**Terminal 2 — frontend**

```bash
PORT=3000 pnpm --filter @workspace/media-craft-ai run dev
```

On Windows PowerShell:

```powershell
$env:PORT = "3000"
pnpm --filter @workspace/media-craft-ai run dev
```

Open the frontend at `http://localhost:3000` when running outside Replit. The frontend uses `/api` routes, so a local reverse proxy or the repository's Replit artifact routing may be needed to route browser `/api` requests to the API on port `8080`. In Replit, use the configured **MediaCraft AI** web workflow and **API Server** workflow; the platform's artifact routing handles the preview paths.

In Replit, the normal run flow is:

1. Open the **MediaCraft AI** web preview.
2. Confirm the **API Server** workflow is running.
3. If either workflow was stopped after changing code or secrets, restart it from the Workflows panel.
4. Upload a small supported media file and run a deterministic preset first.

### 5. Verify the installation

Check that the API responds before testing an upload:

```bash
curl http://localhost:8080/api/healthz
```

If the health route is not available in a particular build, check the API process output for `Server listening` and use the provider diagnostics screen in the frontend. Then test an actual media upload from the UI. A valid source must be one of the supported extensions and must contain a usable audio or video stream with a positive duration.

For a direct API smoke test, replace the path with a local media file:

```bash
curl -X POST http://localhost:8080/api/media/jobs \
  -F "file=@/absolute/path/to/source.mp4;type=video/mp4" \
  -F "preset=compress-video"
```

The API returns a job record immediately. Use the returned job ID to inspect status and events:

```bash
curl http://localhost:8080/api/media/jobs/JOB_ID
curl http://localhost:8080/api/media/jobs/JOB_ID/events
```

### 6. Quality checks and production build

Run these commands before opening a pull request or creating a submission archive:

```bash
# Typecheck shared libraries and all workspace artifacts
pnpm run typecheck

# Typecheck and build all packages
pnpm run build

# API-only typecheck
pnpm --filter @workspace/api-server run typecheck

# Frontend-only typecheck
pnpm --filter @workspace/media-craft-ai run typecheck

# Frontend production build
pnpm --filter @workspace/media-craft-ai run build
```

The frontend build is written to `artifacts/media-craft-ai/dist/public`. The API build is written to `artifacts/api-server/dist`. These directories are generated output and should not be committed.

To serve the frontend production build locally:

```bash
PORT=3000 pnpm --filter @workspace/media-craft-ai run serve
```

The API's `dev` command builds the server before starting it. Its `start` command expects the API build to already exist:

```bash
pnpm --filter @workspace/api-server run build
PORT=8080 pnpm --filter @workspace/api-server run start
```

### 7. API contract changes

The OpenAPI file is the source of truth for the typed API packages. If you change `lib/api-spec/openapi.yaml`, regenerate the client and Zod schemas using the workspace's code-generation command, then run the full checks:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm run build
```

Review generated changes before committing them. Do not hand-edit generated client or schema files when the same change belongs in the OpenAPI source.

### Troubleshooting

#### `spawn ffmpeg ENOENT` or `spawn ffprobe ENOENT`

FFmpeg is not installed or is not on `PATH`. Install FFmpeg, open a new terminal, and rerun:

```bash
which ffmpeg
which ffprobe
```

On Replit, confirm that `.replit` still includes the `ffmpeg` Nix package and restart the API workflow.

#### `PORT environment variable is required`

The API requires an explicit positive `PORT` value:

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

#### Gemini planning or caption generation fails

Confirm that `GEMINI_API_KEY` is present in the API process environment, not only in a frontend environment. Restart the API after adding or changing it. Deterministic presets can still be used for local FFmpeg testing, but Custom Gemini processing and generated captions require Gemini.

#### Provider diagnostics show `not_configured`

This is expected when optional integration variables are absent. Configure the relevant provider variables and restart the API if you need grounding, ClickHouse analytics, or Grafana annotations.

#### Uploads fail during inspection

Confirm the extension is supported, the file is below the 4 GB limit, and both FFmpeg tools can read it. Files must contain at least one usable audio or video stream and a valid positive duration. Try a short MP4 or WAV file to separate an input problem from an environment problem.

#### The browser loads but `/api` calls fail

Make sure both services are running. In a standalone local setup, the frontend and API run on different ports and need a reverse proxy for browser `/api` requests. In Replit, use the configured artifact workflows rather than opening a raw localhost port.

### Security and data-handling notes

- Treat all provider keys and service-account tokens as secrets.
- Never place credentials in frontend code, commit them to Git, or include them in screenshots or submission archives.
- FFmpeg arguments are validated and executed without a shell; do not weaken those validation boundaries when adding features.
- Uploaded sources and processed outputs are temporary server-side job files. Job storage is in memory rather than a permanent media library.
- Use short test media while developing and remove any local files containing sensitive footage after testing.

## Project documentation

For the detailed processing pipeline, preset semantics, processing states, complete API reference, subtitle behavior, testing notes, and connected-service implementation details, see [`PROJECT.md`](PROJECT.md).

## License

MediaCraft AI is released under the MIT License. See [`LICENSE`](LICENSE).
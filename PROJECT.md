# MediaCraft AI Project Guide

This document explains how MediaCraft works, how to run it, how its API behaves, and how its connected services participate in processing.

## How MediaCraft works

MediaCraft is a media transformation and finishing tool. It accepts an uploaded video or audio file, inspects it, asks Gemini to plan a safe FFmpeg operation, renders a new master, verifies the result, and exposes the output for preview or download.

It can produce:

- MP4 video masters
- AI-assisted 9:16 social reframes that keep the focal subject in view
- Web-ready compressed H.264 video
- Captioned social cuts with generated or uploaded subtitles and bold hook styling
- Downloadable, timed SRT captions generated from source audio
- Tightened jump-cut video with dead-air removal and normalized audio
- MP3 audio extracted from video
- MP3 audio converted or transformed from supported audio sources
- Custom video and audio edits described in natural language

It does not currently generate entirely new AI video scenes, characters, images, or animations from text. It transforms media supplied by the user.

## Processing pipeline

1. The frontend sends one supported file, a workflow/instruction, and optionally an SRT/VTT sidecar for Captions & Hook.
2. Multer temporarily receives the upload.
3. The API moves it into a server-owned temporary job directory.
4. `ffprobe` validates the file and reads duration, format, streams, size, and codecs.
5. Built-in recipes use tested server-side FFmpeg argument arrays; Gemini 2.5 Flash converts Custom instructions into a validated JSON FFmpeg argument array.
6. Smart Reframe and Custom workflows can use Gemini plus optional Parallel Search technical grounding; deterministic workflows use server-controlled FFmpeg recipes.
7. MediaCraft validates the generated arguments and replaces its server-owned input/output placeholders.
8. FFmpeg runs with `spawn("ffmpeg", args)`, never through a shell.
9. MediaCraft confirms that FFmpeg exited successfully and produced a non-empty output.
10. If FFmpeg fails, the raw stderr is sent to Gemini for one bounded repair attempt.
11. Caption generation extracts low-bitrate mono audio, asks Gemini for timed SRT captions, validates both syntax and source-duration bounds, and makes the SRT available for download or burn-in.
12. The verified result becomes available as an MP4, MP3, or SRT download.
13. Job analytics are sent to ClickHouse and completion/failure annotations are sent to Grafana when configured.

The maximum is two FFmpeg attempts. The original source is not modified.

## Supported media

Input extensions:

`.mp4`, `.mov`, `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, and `.mxf`.

Uploads are limited to 4 GB. A file must contain at least one usable audio or video stream and a valid positive duration.

Available workflows:

| Workflow | Result |
| --- | --- |
| `smart-reframe` | Uses a bounded Gemini plan to create a polished 9:16 social-video version |
| `captions-hook` | Generates or accepts captions, then burns a bold high-contrast caption treatment |
| `tighten-finish` | Detects longer pauses, joins speech segments, and normalizes the finished audio |
| `extract-audio` | Produces an MP3 and removes the video stream |
| `burn-subtitles` | Burns an uploaded SRT/VTT file or generated captions into a video |
| `generate-subtitles` | Extracts source audio, transcribes it, and returns validated timed SRT captions |
| `compress-video` | Produces a web-ready H.264 MP4 |
| `custom` | Uses the user's natural-language instruction |

## Install and configure

### Requirements

- Node.js 24+
- pnpm
- FFmpeg with both `ffmpeg` and `ffprobe` available on `PATH`
- Gemini API access for natural-language planning

### Install

```bash
pnpm install
```

### Environment variables

Use `.env.example` as a reference. Configure values through Replit Secrets or your local environment. Never commit `.env` or credentials.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Gemini FFmpeg planning and stderr repair |
| `PARALLEL_API_KEY` | Parallel Search grounding |
| `CLICKHOUSE_URL` | HTTPS ClickHouse Cloud endpoint |
| `CLICKHOUSE_USER` | ClickHouse username, usually `default` |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_DATABASE` | ClickHouse database, usually `default` |
| `GRAFANA_URL` | Grafana instance URL |
| `GRAFANA_API_KEY` | Grafana service-account token/API key |
| `GRAFANA_MCP_ENDPOINT` | Optional Grafana MCP endpoint exposed in telemetry |

Gemini is required for a normal AI-planned job. Parallel, ClickHouse, and Grafana report their own connection status and use local fallback behavior where supported.

### Start the services

In one terminal:

```bash
pnpm --filter @workspace/api-server run dev
```

In a second terminal:

```bash
pnpm --filter @workspace/media-craft-ai run dev
```

The API listens on port `8080`. The Vite frontend is available through the configured Replit preview/workflow.

## Development commands

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

## Frontend workflow

1. Open the Studio Workspace.
2. Upload or drag in a supported video/audio file.
3. Choose a preset from Quick Presets or open the Presets Library.
4. For custom processing, choose **Custom Gemini NL Macro** and describe the edit.
5. Start processing.
6. Open Live Processing to watch validation, planning, FFmpeg, repair, and verification events.
7. Preview the verified output.
8. Download or share the completed master.

The interface also includes:

- Recent Jobs
- Archive for completed/failed jobs
- Settings and provider diagnostics
- Light, dark, and system themes
- Command Palette
- Branded video/audio controls

## API guide

The API base path is `/api`.

### Request flow

1. Upload a media file and create a job.
2. Receive a job ID immediately with HTTP `202`.
3. Poll the job endpoint while processing runs.
4. Read the job events for progress.
5. Download the output after the job becomes `succeeded`.

### Create a job

`POST /api/media/jobs` accepts `multipart/form-data`:

| Field | Required | Description |
| --- | --- | --- |
| `file` | Yes | One supported video or audio file |
| `preset` | No | `smart-reframe`, `captions-hook`, `tighten-finish`, `extract-audio`, `compress-video`, or `custom` |
| `prompt` | No | Natural-language instruction, limited to 1,000 characters |
| `subtitle` | No | UTF-8 `.srt` or `.vtt` caption sidecar, accepted only for `burn-subtitles` |
| `subtitleMode` | No | For `burn-subtitles`: `upload` for the sidecar file or `generate` to create captions from source audio before burning |

```bash
curl -X POST http://localhost:8080/api/media/jobs \
  -F "file=@/path/to/source.mp4;type=video/mp4" \
  -F "preset=vertical-reel" \
  -F "prompt=Make this a clean vertical reel with readable framing."
```

The response includes the job ID, status, selected preset, source media inspection, output fields, attempt count, and any error:

```json
{
  "id": "job-id",
  "filename": "source.mp4",
  "status": "queued",
  "preset": "vertical-reel",
  "prompt": "Make this a clean vertical reel with readable framing.",
  "outputUrl": null,
  "outputFilename": null,
  "outputMimeType": null,
  "subtitleSource": null,
  "subtitleUrl": null,
  "subtitleFilename": null,
  "progressPercent": 0,
  "stage": "queued",
  "createdAt": "2026-08-21T12:00:00.000Z",
  "completedAt": null,
  "attempt": 0,
  "error": null,
  "mediaInfo": {
    "durationSeconds": 12.4,
    "formatName": "mov,mp4,m4a,3gp,3g2,mj2",
    "sizeBytes": 1839200,
    "hasVideo": true,
    "hasAudio": true,
    "videoCodec": "h264",
    "audioCodec": "aac",
    "streamCount": 2
  }
}
```

### Get job status

`GET /api/media/jobs/:jobId` returns the current job and source inspection:

```bash
curl http://localhost:8080/api/media/jobs/JOB_ID
```

Statuses:

- `queued` — accepted and waiting to process
- `processing` — Gemini planning or FFmpeg rendering is running
- `healing` — Gemini is repairing a failed FFmpeg attempt
- `succeeded` — output exists and passed verification
- `failed` — processing stopped and `error` explains why

When successful, `outputUrl` points to `/api/media/jobs/JOB_ID/output`. Caption jobs and generated-caption burn jobs also include `subtitleUrl`, which points to `/api/media/jobs/JOB_ID/subtitles`.

### Read processing events

`GET /api/media/jobs/:jobId/events` returns a plain-text processing log:

```bash
curl http://localhost:8080/api/media/jobs/JOB_ID/events
```

Events cover source validation, Gemini planning, Parallel grounding, FFmpeg attempts, repair, output verification, and analytics/telemetry writes.

### Download output

`GET /api/media/jobs/:jobId/output` downloads the verified MP4 or MP3. It returns `404` until processing succeeds.

```bash
curl -L \
  http://localhost:8080/api/media/jobs/JOB_ID/output \
  -o finished-media.mp4
```

### List jobs

```bash
# All jobs in the current server session
curl http://localhost:8080/api/media/jobs

# Completed and failed jobs
curl "http://localhost:8080/api/media/jobs?archive=true"
```

Jobs are intentionally stored in memory. Restarting the API clears the job list and temporary media files.

### Analytics and health

```bash
# Analytics with optional status, codec, and preset filters
curl "http://localhost:8080/api/media/analytics?status=succeeded&preset=compress-video"

# Processing telemetry
curl http://localhost:8080/api/metrics/telemetry

# Sanitized connected-service diagnostics
curl http://localhost:8080/api/integrations/status

# API health
curl http://localhost:8080/api/healthz
```

The diagnostics endpoint never returns credentials.

## How the connected services work

### Gemini

The API uses the official `@google/genai` SDK to send the user's instruction, source filename, output type, and technical context to Gemini 2.5 Flash.

Gemini returns JSON containing an FFmpeg `args` array. MediaCraft validates that response before execution:

- Only one input is allowed.
- Input and output must use server-owned placeholders.
- Shell syntax and unsafe arguments are rejected.
- Audio outputs cannot contain video filters or video-only flags.
- The final command is executed directly with `spawn`, not a shell.

If FFmpeg fails, the raw stderr is sent back to Gemini as repair context. Repair stops after the second attempt.

### Parallel Search

Parallel is used for technical grounding, not for rendering media.

For each job, MediaCraft builds a short search objective around the requested operation, codec, format, or delivery target. It sends that objective to:

```text
POST https://api.parallel.ai/v1/search
```

The request uses the `PARALLEL_API_KEY`, a sanitized search query, basic search mode, and a bounded response size. Returned excerpts are added to Gemini's planning context so the model can make better-informed FFmpeg choices.

If Parallel is unavailable, the job continues with conservative local filmmaking context and the provider status becomes `error`. If no key is configured, it uses a standard fallback context and marks Parallel as `not_configured`.

### ClickHouse

ClickHouse stores media-job analytics.

After a job succeeds or fails, MediaCraft records:

- Job ID
- Original filename
- Preset
- Source duration
- Video codec
- Audio codec
- Final status
- Number of attempts
- Timestamp

The API creates the `mediacraft_jobs` table if it does not exist, then inserts records using `JSONEachRow` over the configured HTTPS ClickHouse endpoint. It also keeps the most recent 500 records in a local analytics buffer so the UI can continue showing session analytics when ClickHouse is unavailable.

ClickHouse is used for analytics and observability, not for storing the uploaded media files.

### Grafana

Grafana receives operational annotations for completed and failed jobs. Each annotation includes:

- MediaCraft tags
- Job ID
- Success or failure status
- Selected preset
- Source duration

MediaCraft also tracks local telemetry such as active jobs, completed jobs, failed jobs, self-heal attempts, and the last FFmpeg error. The Settings/diagnostics view exposes the Grafana connection state without exposing the API key.

Grafana is used for operational visibility and annotations. It does not process or store the media output.

## Manual API test

Create a one-second fixture and submit it:

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

Use the returned ID with the status, events, and output endpoints above.

## Source map

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

Important source files:

- `artifacts/media-craft-ai/src/App.tsx` — studio UI and interaction flow
- `artifacts/media-craft-ai/src/index.css` — theme and responsive styling
- `artifacts/api-server/src/lib/media-processor.ts` — media pipeline and job lifecycle
- `artifacts/api-server/src/lib/gemini-ffmpeg.ts` — Gemini planning and validation
- `artifacts/api-server/src/lib/parallel-search.ts` — Parallel grounding
- `artifacts/api-server/src/lib/clickhouse-mcp.ts` — ClickHouse analytics
- `artifacts/api-server/src/lib/grafana-mcp.ts` — Grafana telemetry and annotations
- `artifacts/api-server/src/routes/media.ts` — media and diagnostics routes
- `lib/api-spec/openapi.yaml` — API contract
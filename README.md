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

## Project documentation

For installation, configuration, development commands, API usage, processing states, testing, and connected-service details, see [`PROJECT.md`](PROJECT.md).

## License

MediaCraft AI is released under the MIT License. See [`LICENSE`](LICENSE).
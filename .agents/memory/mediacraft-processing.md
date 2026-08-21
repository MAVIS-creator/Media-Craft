---
name: MediaCraft processing fallback
description: MediaCraft's first processing path uses safe local FFmpeg recipes and bounded repair attempts when managed Gemini access is unavailable.
---

The media pipeline uses Gemini to produce a validated JSON FFmpeg argument array, then sends raw FFmpeg stderr back to Gemini for a bounded repair attempt. Missing Gemini credentials fail explicitly instead of silently using a keyword fallback. The intended output medium (audio or video) must be an explicit planner constraint and a server-side validation boundary.

**Why:** The requested product contract requires natural-language interpretation and stderr-driven argument repair from Gemini; silently substituting keyword matching would misrepresent that behavior.

**How to apply:** Preserve JSON schema validation, server-owned input/output placeholders, argument-array execution without a shell, job-directory isolation, and the retry limit. For audio-only outputs, reject video flags and visual filters even when the model labels them as an audio filter.

Caption transcription is a separate Gemini audio workflow: extract server-owned mono audio, request timed SRT, validate cue syntax and that timing fits the inspected source duration, then use that SRT for optional burn-in. Retry transient Gemini capacity failures once with a visible job stage, then fail explicitly.

**Why:** Temporary Gemini 503 capacity responses can interrupt a valid caption request; unlimited retries would make job duration and cost unpredictable, while unbounded SRT timing can produce captions that do not match the source.

**How to apply:** Keep manual SRT/VTT burn-in distinct from generated captions, retain only a bounded retry for 429/5xx-style transcription failures, and never pass client paths to FFmpeg subtitle filters.

SRT input should be canonicalized before FFmpeg: repair timestamp arrows split across lines, remove cue-number metadata from caption bodies, and emit sequential cue blocks with blank-line separators. Otherwise libass can display timestamps and all cues as visible text.

**Why:** Real-world Gemini output and hand-authored files can be structurally close to SRT while violating the strict cue-header layout expected by FFmpeg/libass.

**How to apply:** Validate repaired timestamps and source-duration bounds first, then write the canonical server-owned SRT used for burn-in; keep VTT validation separate because its WEBVTT header and cue rules differ.
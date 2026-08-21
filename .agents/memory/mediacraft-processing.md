---
name: MediaCraft processing fallback
description: MediaCraft's first processing path uses safe local FFmpeg recipes and bounded repair attempts when managed Gemini access is unavailable.
---

The media pipeline uses Gemini to produce a validated JSON FFmpeg argument array, then sends raw FFmpeg stderr back to Gemini for a bounded repair attempt. Missing Gemini credentials fail explicitly instead of silently using a keyword fallback. The intended output medium (audio or video) must be an explicit planner constraint and a server-side validation boundary.

**Why:** The requested product contract requires natural-language interpretation and stderr-driven argument repair from Gemini; silently substituting keyword matching would misrepresent that behavior.

**How to apply:** Preserve JSON schema validation, server-owned input/output placeholders, argument-array execution without a shell, job-directory isolation, and the retry limit. For audio-only outputs, reject video flags and visual filters even when the model labels them as an audio filter.
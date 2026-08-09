---
name: MediaCraft processing fallback
description: MediaCraft's first processing path uses safe local FFmpeg recipes and bounded repair attempts when managed Gemini access is unavailable.
---

The media pipeline should remain useful without silently claiming Gemini is connected: preset jobs run locally with validated FFmpeg argument arrays, and failures receive a bounded conservative retry with visible healing events.

**Why:** Managed Gemini setup returned an account-upgrade state during the initial build, while the core product value (reliable media processing) can still be delivered locally.

**How to apply:** If Gemini access becomes available later, add it as an explicit diagnosis/command-generation adapter while preserving local command validation, job-directory isolation, and the retry limit.
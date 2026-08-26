import { Router, type IRouter } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createJob, getJob, getJobsRoot, inspectMediaFile, listJobs, prepareJobDirectory } from "../lib/media-processor";
import { GetMediaJobResponse, CreateMediaJobResponse } from "@workspace/api-zod";
import { validateSubtitleFile } from "../lib/subtitle-utils";

const router: IRouter = Router();
const incomingDir = path.join(os.tmpdir(), "mediacraft-ai", "incoming");
mkdirSync(incomingDir, { recursive: true });
const upload = multer({
  dest: incomingDir,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const supported = file.fieldname === "file"
      ? /\.(mp4|mov|mp3|wav|m4a|aac|flac|ogg|mxf)$/i.test(file.originalname)
      : file.fieldname === "subtitle" && /\.(srt|vtt)$/i.test(file.originalname);
    callback(null, supported);
  },
});

const allowedPresets = new Set([
  "smart-reframe",
  "captions-hook",
  "tighten-finish",
  "vertical-reel",
  "extract-audio",
  "burn-subtitles",
  "generate-subtitles",
  "compress-video",
  "custom",
]);

function publicJob(job: NonNullable<ReturnType<typeof getJob>>) {
  const {
    inputPath: _inputPath,
    outputPath: _outputPath,
    subtitlePath: _subtitlePath,
    subtitleMode: _subtitleMode,
    events: _events,
    ...safeJob
  } = job;
  return safeJob;
}

router.post("/media/jobs", upload.fields([{ name: "file", maxCount: 1 }, { name: "subtitle", maxCount: 1 }]), async (req, res): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const source = files?.file?.[0];
  const subtitle = files?.subtitle?.[0];
  if (!source) {
    res.status(400).json({ error: "Upload a supported video or audio file." });
    return;
  }

  const requestedPreset = typeof req.body.preset === "string" ? req.body.preset : null;
  if (requestedPreset && !allowedPresets.has(requestedPreset)) {
    res.status(400).json({ error: "That workflow is no longer available. Choose Smart Reframe, Captions & Hook, Tighten & Finish, Extract Audio, Compress for Delivery, or Custom." });
    return;
  }
  const preset = requestedPreset ?? "custom";
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt.slice(0, 1000) : "";
  const requestedSubtitleMode = ["generate", "upload", "standard", "karaoke", "none"].includes(req.body.subtitleMode)
    ? req.body.subtitleMode as "generate" | "upload" | "standard" | "karaoke" | "none"
    : preset === "captions-hook" ? "karaoke" : null;
  const requestedSubtitleOutput = req.body.subtitleOutput === "file" || req.body.subtitleOutput === "burn"
    ? req.body.subtitleOutput
    : preset === "captions-hook" ? "burn" : null;
  if (subtitle && preset !== "burn-subtitles" && preset !== "captions-hook") {
    res.status(400).json({ error: "A subtitle file can only be used with Captions & Hook." });
    return;
  }
  if ((preset === "burn-subtitles" || preset === "captions-hook") && requestedSubtitleMode !== "none" && !subtitle && requestedSubtitleMode !== "generate" && requestedSubtitleMode !== "karaoke") {
    res.status(400).json({ error: "Attach an SRT/VTT caption file or choose Generate Captions from Audio." });
    return;
  }

  const directory = await prepareJobDirectory(source.filename);
  // Never use the client-provided filename as a filesystem path. Keep it as
  // display metadata only and store every upload under a fixed server name.
  const inputPath = path.join(directory, "source-media");
  const fs = await import("node:fs/promises");
  await fs.rename(source.path, inputPath);
  await getJobsRoot();
  let mediaInfo;
  try {
    mediaInfo = await inspectMediaFile(inputPath);
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    res.status(422).json({
      error: error instanceof Error ? error.message : "Media inspection failed. Upload a valid audio or video file.",
    });
    return;
  }

  let subtitlePath: string | null = null;
  try {
    if (subtitle) {
      const validated = await validateSubtitleFile(subtitle.path, subtitle.originalname);
      subtitlePath = path.join(directory, `captions.${validated.format}`);
      await fs.writeFile(subtitlePath, validated.text, "utf8");
      await fs.rm(subtitle.path, { force: true });
    }
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(subtitle?.path ?? "", { force: true }).catch(() => undefined);
    res.status(422).json({
      error: error instanceof Error ? error.message : "Subtitle validation failed.",
    });
    return;
  }

  const job = createJob({
    filename: source.originalname,
    inputPath,
    preset: preset as Parameters<typeof createJob>[0]["preset"],
    prompt,
    mediaInfo,
    subtitlePath,
    subtitleMode: subtitlePath ? "upload" : requestedSubtitleMode,
    subtitleOutput: requestedSubtitleOutput,
  });

  res.status(202).json(CreateMediaJobResponse.parse(publicJob(job)));
});

router.get("/media/jobs", (req, res): void => {
  const archive = req.query.archive === "true";
  const jobs = listJobs()
    .filter((job) => (archive ? job.status === "succeeded" || job.status === "failed" : true))
    .map(publicJob);
  res.json(jobs);
});

router.get("/media/jobs/:jobId", (req, res): void => {
  const id = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Media job not found." });
    return;
  }
  res.json(GetMediaJobResponse.parse(publicJob(job)));
});

router.get("/media/jobs/:jobId/events", (req, res): void => {
  const id = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Media job not found." });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(job.events.join("\n"));
});

import { getGrafanaTelemetry } from "../lib/grafana-mcp";
import { probeGrafana } from "../lib/grafana-mcp";
import { probeClickHouse, queryClickHouseAnalytics } from "../lib/clickhouse-mcp";
import { probeParallel } from "../lib/parallel-search";

router.get("/metrics/telemetry", (_req, res): void => {
  const allJobs = listJobs();
  const active = allJobs.filter((j) => j.status === "processing" || j.status === "healing" || j.status === "queued").length;
  const completed = allJobs.filter((j) => j.status === "succeeded").length;
  const failed = allJobs.filter((j) => j.status === "failed").length;

  res.json(getGrafanaTelemetry({ active, completed, failed }));
});

router.get("/integrations/status", async (_req, res): Promise<void> => {
  const providers = await Promise.all([probeParallel(), probeClickHouse(), probeGrafana()]);
  res.json({
    checkedAt: new Date().toISOString(),
    providers,
  });
});

router.get("/media/analytics", (req, res): void => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const codec = typeof req.query.codec === "string" ? req.query.codec : undefined;
  const preset = typeof req.query.preset === "string" ? req.query.preset : undefined;

  res.json(queryClickHouseAnalytics({ status, codec, preset }));
});

router.get("/media/jobs/:jobId/output", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = getJob(id);
  if (!job?.outputPath || job.status !== "succeeded") {
    res.status(404).json({ error: "This media output is not ready." });
    return;
  }
  res.download(job.outputPath, job.outputFilename ?? "mediacraft-output", (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: "The media output could not be read." });
    }
  });
});

router.get("/media/jobs/:jobId/subtitles", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = getJob(id);
  if (!job?.subtitlePath || !job.subtitleFilename) {
    res.status(404).json({ error: "Captions are not available for this job." });
    return;
  }
  res.download(job.subtitlePath, job.subtitleFilename, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: "The subtitle file could not be read." });
    }
  });
});

export default router;
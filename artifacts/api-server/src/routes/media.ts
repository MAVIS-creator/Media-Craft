import { Router, type IRouter } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createJob, getJob, getJobsRoot, inspectMediaFile, listJobs, prepareJobDirectory } from "../lib/media-processor";
import { GetMediaJobResponse, CreateMediaJobResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const incomingDir = path.join(os.tmpdir(), "mediacraft-ai", "incoming");
mkdirSync(incomingDir, { recursive: true });
const upload = multer({
  dest: incomingDir,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const supported = /\.(mp4|mov|mp3|wav|m4a|aac|flac|ogg|mxf)$/i.test(file.originalname);
    callback(null, supported);
  },
});

const allowedPresets = new Set([
  "vertical-reel",
  "extract-audio",
  "burn-subtitles",
  "compress-video",
  "custom",
]);

function publicJob(job: NonNullable<ReturnType<typeof getJob>>) {
  const { inputPath: _inputPath, outputPath: _outputPath, events: _events, ...safeJob } = job;
  return safeJob;
}

router.post("/media/jobs", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Upload a supported video or audio file." });
    return;
  }

  const preset = typeof req.body.preset === "string" && allowedPresets.has(req.body.preset)
    ? req.body.preset
    : "custom";
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt.slice(0, 1000) : "";
  const directory = await prepareJobDirectory(req.file.filename);
  const inputPath = path.join(directory, req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-"));
  const fs = await import("node:fs/promises");
  await fs.rename(req.file.path, inputPath);
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

  const job = createJob({
    filename: req.file.originalname,
    inputPath,
    preset: preset as Parameters<typeof createJob>[0]["preset"],
    prompt,
    mediaInfo,
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
import { queryClickHouseAnalytics } from "../lib/clickhouse-mcp";

router.get("/metrics/telemetry", (_req, res): void => {
  const allJobs = listJobs();
  const active = allJobs.filter((j) => j.status === "processing" || j.status === "healing" || j.status === "queued").length;
  const completed = allJobs.filter((j) => j.status === "succeeded").length;
  const failed = allJobs.filter((j) => j.status === "failed").length;

  res.json(getGrafanaTelemetry({ active, completed, failed }));
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

export default router;
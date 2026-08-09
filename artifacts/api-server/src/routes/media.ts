import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createJob, getJob, getJobsRoot, prepareJobDirectory } from "../lib/media-processor";
import { GetMediaJobResponse, CreateMediaJobResponse } from "@workspace/api-zod";

const router: IRouter = Router();
mkdirSync("/tmp/mediacraft-ai/incoming", { recursive: true });
const upload = multer({
  dest: "/tmp/mediacraft-ai/incoming",
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

  const job = createJob({
    filename: req.file.originalname,
    inputPath,
    preset: preset as Parameters<typeof createJob>[0]["preset"],
    prompt,
  });

  res.status(202).json(CreateMediaJobResponse.parse(publicJob(job)));
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
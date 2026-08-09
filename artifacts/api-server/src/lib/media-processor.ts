import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { logger } from "./logger";

export type MediaJobStatus =
  | "queued"
  | "processing"
  | "healing"
  | "succeeded"
  | "failed";

export type MediaPreset =
  | "vertical-reel"
  | "extract-audio"
  | "burn-subtitles"
  | "compress-video"
  | "custom";

export type MediaJob = {
  id: string;
  filename: string;
  status: MediaJobStatus;
  preset: MediaPreset;
  prompt: string;
  outputUrl: string | null;
  outputFilename: string | null;
  outputMimeType: string | null;
  createdAt: string;
  completedAt: string | null;
  attempt: number;
  error: string | null;
  inputPath: string;
  outputPath: string | null;
  events: string[];
};

const jobs = new Map<string, MediaJob>();
const jobsRoot = path.join("/tmp", "mediacraft-ai");
const maxAttempts = 2;

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function event(job: MediaJob, message: string): void {
  job.events.push(`[${timestamp()}] ${message}`);
}

function safeBaseName(filename: string): string {
  const parsed = path.parse(filename);
  const base = parsed.name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  return base || "media";
}

function presetLabel(preset: MediaPreset): string {
  return {
    "vertical-reel": "vertical reel",
    "extract-audio": "audio extraction",
    "burn-subtitles": "caption burn-in",
    "compress-video": "compression",
    custom: "custom render",
  }[preset];
}

function isAudioFile(filename: string): boolean {
  return /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(filename);
}

function createCommand(
  job: MediaJob,
  outputPath: string,
  conservative = false,
): string[] {
  const input = job.inputPath;
  const prompt = job.prompt.toLowerCase();

  if (
    job.preset === "extract-audio" ||
    (job.preset === "custom" && /(audio|mp3|sound|music)/.test(prompt))
  ) {
    return ["-y", "-i", input, "-vn", "-c:a", "libmp3lame", outputPath];
  }

  if (
    job.preset === "vertical-reel" ||
    (job.preset === "custom" && /(vertical|reel|9:16|portrait)/.test(prompt))
  ) {
    if (isAudioFile(job.filename)) {
      return ["-y", "-i", input, "-vn", "-c:a", "libmp3lame", outputPath];
    }
    const videoFilter = conservative
      ? "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black"
      : "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black";
    return [
      "-y",
      "-i",
      input,
      "-vf",
      videoFilter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ];
  }

  if (job.preset === "burn-subtitles") {
    if (isAudioFile(job.filename)) {
      return ["-y", "-i", input, "-vn", "-c:a", "libmp3lame", outputPath];
    }
    const fontSize = conservative ? 30 : 38;
    return [
      "-y",
      "-i",
      input,
      "-vf",
      `drawtext=text='MEDIACRAFT AI':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=14:x=(w-text_w)/2:y=h-(text_h*2)`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ];
  }

  if (
    job.preset === "compress-video" ||
    (job.preset === "custom" && /(compress|smaller|size|web)/.test(prompt))
  ) {
    if (isAudioFile(job.filename)) {
      return ["-y", "-i", input, "-c:a", "libmp3lame", "-b:a", "96k", outputPath];
    }
    return [
      "-y",
      "-i",
      input,
      "-c:v",
      "libx264",
      "-crf",
      conservative ? "30" : "28",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      outputPath,
    ];
  }

  if (isAudioFile(job.filename)) {
    return ["-y", "-i", input, "-c:a", "libmp3lame", "-b:a", "160k", outputPath];
  }

  return [
    "-y",
    "-i",
    input,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: 1, stderr: error.message });
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

export function getJob(id: string): MediaJob | undefined {
  return jobs.get(id);
}

export function createJob(input: {
  filename: string;
  inputPath: string;
  preset: MediaPreset;
  prompt: string;
}): MediaJob {
  const id = randomUUID();
  const job: MediaJob = {
    id,
    filename: input.filename,
    status: "queued",
    preset: input.preset,
    prompt: input.prompt,
    outputUrl: null,
    outputFilename: null,
    outputMimeType: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    attempt: 0,
    error: null,
    inputPath: input.inputPath,
    outputPath: null,
    events: [],
  };
  jobs.set(id, job);
  void processJob(id);
  return job;
}

export async function prepareJobDirectory(id: string): Promise<string> {
  const directory = path.join(jobsRoot, id);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function processJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;

  job.status = "processing";
  event(job, `Source received. Preparing ${presetLabel(job.preset)}.`);

  const directory = path.dirname(job.inputPath);
  const extension = isAudioFile(job.filename) || job.preset === "extract-audio" ? ".mp3" : ".mp4";
  const outputFilename = `${safeBaseName(job.filename)}-mediacraft${extension}`;
  const outputPath = path.join(directory, outputFilename);
  job.outputPath = outputPath;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    job.attempt = attempt;
    const conservative = attempt > 1;
    if (conservative) {
      job.status = "healing";
      event(job, "FFmpeg returned an error. Diagnosing and rebuilding with a conservative profile.");
    } else {
      event(job, "FFmpeg render started with the selected recipe.");
    }

    const args = createCommand(job, outputPath, conservative);
    event(job, `Render attempt ${attempt}/${maxAttempts} · ${args.slice(0, 6).join(" ")} …`);
    const result = await runFfmpeg(args);
    let outputExists = false;
    try {
      outputExists = (await stat(outputPath)).size > 0;
    } catch {
      outputExists = false;
    }

    if (result.code === 0 && outputExists) {
      job.status = "succeeded";
      job.completedAt = new Date().toISOString();
      job.outputFilename = outputFilename;
      job.outputUrl = `/api/media/jobs/${id}/output`;
      job.outputMimeType = extension === ".mp3" ? "audio/mpeg" : "video/mp4";
      job.error = null;
      event(job, `Render complete. Output verified at ${outputFilename}.`);
      logger.info({ jobId: id, attempt }, "Media job completed");
      return;
    }

    const diagnostic = result.stderr.trim().split("\n").slice(-3).join(" ").slice(0, 420);
    job.error = diagnostic || "FFmpeg exited without producing a verified output.";
    event(job, `RED · Attempt ${attempt} failed: ${job.error}`);
  }

  job.status = "failed";
  job.completedAt = new Date().toISOString();
  event(job, "Render stopped after the safe retry limit. The source file is untouched.");
  logger.warn({ jobId: id, error: job.error }, "Media job failed");
}

export async function getJobsRoot(): Promise<string> {
  await mkdir(jobsRoot, { recursive: true });
  return jobsRoot;
}

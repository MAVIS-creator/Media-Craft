import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { logger } from "./logger";
import { generateFfmpegArgs, resolveFfmpegArgs } from "./gemini-ffmpeg";

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

export type MediaInspection = {
  durationSeconds: number;
  formatName: string;
  sizeBytes: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  streamCount: number;
};

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
  mediaInfo: MediaInspection;
  inputPath: string;
  outputPath: string | null;
  events: string[];
};

const jobs = new Map<string, MediaJob>();
const jobsRoot = path.join(os.tmpdir(), "mediacraft-ai");
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

function isAudioFile(filename: string): boolean {
  return /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(filename);
}

function presetInstruction(preset: MediaPreset): string {
  return {
    "vertical-reel":
      "Convert this source into a polished 9:16 vertical reel for social media, preserving the important audio.",
    "extract-audio":
      "Extract the source audio as a high-quality MP3 and remove the video stream.",
    "burn-subtitles":
      "Burn readable subtitles into the video if subtitle data is available, preserving the source audio.",
    "compress-video":
      "Compress this video to a web-ready H.264 MP4 with a sensible quality/size balance.",
    custom: "Process the source according to the editor's natural-language instruction.",
  }[preset];
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

export function listJobs(): MediaJob[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function inspectMediaFile(inputPath: string): Promise<MediaInspection> {
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        inputPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

  if (result.code !== 0) {
    throw new Error(`Media inspection failed: ${result.stderr.trim() || "ffprobe could not read this file."}`);
  }

  let parsed: {
    format?: { format_name?: string; duration?: string; size?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string }>;
  };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("Media inspection failed: ffprobe returned invalid metadata.");
  }

  const streams = parsed.streams ?? [];
  const hasVideo = streams.some((stream) => stream.codec_type === "video");
  const hasAudio = streams.some((stream) => stream.codec_type === "audio");
  const videoCodec = streams.find((stream) => stream.codec_type === "video")?.codec_name ?? null;
  const audioCodec = streams.find((stream) => stream.codec_type === "audio")?.codec_name ?? null;
  const durationSeconds = Number(parsed.format?.duration ?? 0);
  if (streams.length === 0 || (!hasVideo && !hasAudio)) {
    throw new Error("Media inspection failed: the file has no usable audio or video stream.");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Media inspection failed: the file has no valid duration and may be corrupt.");
  }
  if ((hasVideo && !videoCodec) || (hasAudio && !audioCodec)) {
    throw new Error("Media inspection failed: a media stream is missing its codec metadata.");
  }

  return {
    durationSeconds,
    formatName: parsed.format?.format_name ?? "unknown",
    sizeBytes: Number(parsed.format?.size ?? 0),
    hasVideo,
    hasAudio,
    videoCodec,
    audioCodec,
    streamCount: streams.length,
  };
}

export function createJob(input: {
  filename: string;
  inputPath: string;
  preset: MediaPreset;
  prompt: string;
  mediaInfo: MediaInspection;
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
    mediaInfo: input.mediaInfo,
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
  event(job, `Source validated · ${job.mediaInfo.formatName} · ${job.mediaInfo.durationSeconds.toFixed(2)}s · ${job.mediaInfo.streamCount} stream(s).`);
  event(job, "Source received. Asking Gemini to plan the FFmpeg render.");

  const directory = path.dirname(job.inputPath);
  const extension =
    isAudioFile(job.filename) || job.preset === "extract-audio" ? ".mp3" : ".mp4";
  const outputFilename = `${safeBaseName(job.filename)}-mediacraft${extension}`;
  const outputPath = path.join(directory, outputFilename);
  job.outputPath = outputPath;
  const instruction = job.prompt.trim() || presetInstruction(job.preset);
  let stderr = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    job.attempt = attempt;
    if (attempt > 1) {
      job.status = "healing";
      event(job, "GOLD · Sending raw FFmpeg stderr to Gemini for argument repair.");
    } else {
      job.status = "processing";
      event(job, "Gemini returned a JSON FFmpeg argument plan.");
    }

    let args: string[];
    try {
      const plannedArgs = await generateFfmpegArgs({
        instruction,
        filename: job.filename,
        stderr: attempt > 1 ? stderr : undefined,
      });
      args = resolveFfmpegArgs(plannedArgs, job.inputPath, outputPath);
    } catch (error) {
      job.error = error instanceof Error ? error.message : "Gemini could not create FFmpeg arguments.";
      event(job, `RED · ${job.error}`);
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      logger.warn({ jobId: id, error: job.error }, "Gemini FFmpeg planning failed");
      return;
    }

    event(job, `Render attempt ${attempt}/${maxAttempts} · ffmpeg ${args.slice(0, 6).join(" ")} …`);
    const result = await runFfmpeg(args);
    stderr = result.stderr;
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
      event(job, `GREEN · Render complete. Output verified at ${outputFilename}.`);
      logger.info({ jobId: id, attempt }, "Media job completed");
      return;
    }

    job.error = stderr.trim() || "FFmpeg exited without producing a verified output.";
    event(job, `RED · Attempt ${attempt} failed: ${job.error.slice(-420)}`);
  }

  job.status = "failed";
  job.completedAt = new Date().toISOString();
  event(job, "Render stopped after the Gemini repair limit. The source file is untouched.");
  logger.warn({ jobId: id, error: job.error }, "Media job failed");
}

export async function getJobsRoot(): Promise<string> {
  await mkdir(jobsRoot, { recursive: true });
  return jobsRoot;
}
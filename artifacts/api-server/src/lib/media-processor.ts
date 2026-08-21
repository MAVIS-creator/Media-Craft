import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { logger } from "./logger";
import { generateFfmpegArgs, resolveFfmpegArgs } from "./gemini-ffmpeg";
import { recordGrafanaJobEvent, recordSelfHealEvent } from "./grafana-mcp";
import { logToClickHouse } from "./clickhouse-mcp";
import { getParallelStatus } from "./parallel-search";
import { generateSrtFromAudio } from "./gemini-captions";
import { validateGeneratedSrt } from "./subtitle-utils";

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
  | "generate-subtitles"
  | "compress-video"
  | "upscale-video"
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
  subtitleSource: "uploaded" | "generated" | null;
  subtitleUrl: string | null;
  subtitleFilename: string | null;
  createdAt: string;
  completedAt: string | null;
  attempt: number;
  error: string | null;
  mediaInfo: MediaInspection;
  subtitlePath: string | null;
  subtitleMode: "upload" | "generate" | null;
  inputPath: string;
  outputPath: string | null;
  events: string[];
  progressPercent: number;
  stage: string;
};

const jobs = new Map<string, MediaJob>();
const jobsRoot = path.join(os.tmpdir(), "mediacraft-ai");
const maxAttempts = 2;

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function event(job: MediaJob, message: string, progress?: number, stage?: string): void {
  if (progress !== undefined) job.progressPercent = Math.max(0, Math.min(100, progress));
  if (stage) job.stage = stage;
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
      "Burn the supplied or generated captions into the video, preserving source audio.",
    "generate-subtitles":
      "Generate a timed SRT caption file from the source audio.",
    "compress-video":
      "Compress this video to a web-ready H.264 MP4 with a sensible quality/size balance.",
    "upscale-video":
      "Upscale this video by two times with a high-quality Lanczos scaler while preserving audio.",
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

function escapeSubtitleFilterPath(filePath: string): string {
  return filePath.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function deterministicPresetArgs(job: MediaJob, outputPath: string, subtitlePath?: string): string[] | null {
  const input = job.inputPath;
  switch (job.preset) {
    case "vertical-reel":
      if (!job.mediaInfo.hasVideo) throw new Error("Vertical Reel requires a video source.");
      return [
        "-y", "-i", input,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        outputPath,
      ];
    case "extract-audio":
      if (!job.mediaInfo.hasAudio) throw new Error("Audio extraction requires a source with an audio stream.");
      return [
        "-y", "-i", input,
        "-map", "0:a:0", "-vn",
        "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "48000",
        outputPath,
      ];
    case "burn-subtitles":
      if (!job.mediaInfo.hasVideo) throw new Error("Burn Subtitles & Captions requires a video source.");
      if (!subtitlePath) throw new Error("Attach an SRT/VTT caption file or choose Generate Captions from Audio before burning subtitles.");
      return [
        "-y", "-i", input,
        "-vf", `subtitles='${escapeSubtitleFilterPath(subtitlePath)}':force_style='FontName=Arial,FontSize=24,Outline=2,Shadow=1,Alignment=2,MarginV=48'`,
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "copy", "-movflags", "+faststart",
        outputPath,
      ];
    case "compress-video":
      if (!job.mediaInfo.hasVideo) throw new Error("Web-Ready H.264 Compress requires a video source.");
      return [
        "-y", "-i", input,
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "medium", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        outputPath,
      ];
    case "upscale-video":
      if (!job.mediaInfo.hasVideo) throw new Error("Video Upscale requires a video source.");
      return [
        "-y", "-i", input,
        "-vf", "scale=trunc(iw*2/2)*2:trunc(ih*2/2)*2:flags=lanczos",
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-c:a", "copy", "-movflags", "+faststart",
        outputPath,
      ];
    case "custom":
    case "generate-subtitles":
      return null;
  }
}

async function createGeneratedSubtitle(job: MediaJob, directory: string): Promise<string> {
  if (!job.mediaInfo.hasAudio) {
    throw new Error("Caption generation requires a source with an audio stream.");
  }
  const audioPath = path.join(directory, "caption-audio.mp3");
  event(job, "Extracting source audio for accurate caption generation.", 22, "extracting-audio");
  const extraction = await runFfmpeg([
    "-y", "-i", job.inputPath,
    "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
    "-c:a", "libmp3lame", "-b:a", "64k",
    audioPath,
  ]);
  if (extraction.code !== 0 || !(await stat(audioPath).catch(() => null))) {
    throw new Error(`Could not extract source audio for captions: ${extraction.stderr.trim() || "FFmpeg failed."}`);
  }
  const audioSize = (await stat(audioPath)).size;
  if (audioSize > 25 * 1024 * 1024) {
    throw new Error("Caption generation currently supports extracted audio up to 25 MB. Trim the source and try again.");
  }

  event(job, "Gemini is transcribing the extracted audio into timed captions.", 45, "generating-captions");
  const srt = validateGeneratedSrt(await generateSrtFromAudio({
    audioPath,
    durationSeconds: job.mediaInfo.durationSeconds,
    onRetry: () => event(job, "Gemini is briefly busy; retrying caption transcription once.", 46, "retrying-transcription"),
  }), job.mediaInfo.durationSeconds);
  const subtitlePath = path.join(directory, "generated-captions.srt");
  await writeFile(subtitlePath, srt, "utf8");
  job.subtitlePath = subtitlePath;
  job.subtitleSource = "generated";
  job.subtitleFilename = `${safeBaseName(job.filename)}-captions.srt`;
  job.subtitleUrl = `/api/media/jobs/${job.id}/subtitles`;
  event(job, "Timed captions generated and validated against the source audio.", 60, "captions-ready");
  return subtitlePath;
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
  subtitlePath?: string | null;
  subtitleMode?: "upload" | "generate" | null;
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
    subtitleSource: input.subtitlePath ? "uploaded" : null,
    subtitleUrl: null,
    subtitleFilename: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    attempt: 0,
    error: null,
    mediaInfo: input.mediaInfo,
    subtitlePath: input.subtitlePath ?? null,
    subtitleMode: input.subtitleMode ?? null,
    inputPath: input.inputPath,
    outputPath: null,
    events: [],
    progressPercent: 0,
    stage: "queued",
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
  event(job, `Source validated · ${job.mediaInfo.formatName} · ${job.mediaInfo.durationSeconds.toFixed(2)}s · ${job.mediaInfo.streamCount} stream(s).`, 10, "source-validated");

  const directory = path.dirname(job.inputPath);
  const outputExtension = job.preset === "extract-audio" || (isAudioFile(job.filename) && job.preset === "custom") ? ".mp3" : ".mp4";
  const outputFilename = `${safeBaseName(job.filename)}-mediacraft${outputExtension}`;
  const outputPath = path.join(directory, outputFilename);

  const recordOutcome = (status: "succeeded" | "failed") => {
    logToClickHouse({
      jobId: id,
      filename: job.filename,
      preset: job.preset,
      durationSeconds: job.mediaInfo.durationSeconds,
      videoCodec: job.mediaInfo.videoCodec,
      audioCodec: job.mediaInfo.audioCodec,
      status,
      attempts: job.attempt,
      timestamp: new Date().toISOString(),
    });
    recordGrafanaJobEvent({
      jobId: id,
      status,
      preset: job.preset,
      durationSeconds: job.mediaInfo.durationSeconds,
    });
  };

  const fail = (message: string) => {
    job.error = message;
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    event(job, `RED · ${message}`, job.progressPercent, "failed");
    recordOutcome("failed");
    logger.warn({ jobId: id, error: message }, "Media job failed");
  };

  try {
    if (job.preset === "generate-subtitles" || (job.preset === "burn-subtitles" && job.subtitleMode === "generate")) {
      await createGeneratedSubtitle(job, directory);
    }

    if (job.preset === "generate-subtitles") {
      if (!job.subtitlePath || !job.subtitleFilename) throw new Error("Caption generation did not create a subtitle file.");
      job.outputPath = job.subtitlePath;
      job.outputFilename = job.subtitleFilename;
      job.outputUrl = `/api/media/jobs/${id}/output`;
      job.outputMimeType = "application/x-subrip";
      job.status = "succeeded";
      job.completedAt = new Date().toISOString();
      event(job, `GREEN · Captions are ready at ${job.subtitleFilename}.`, 100, "completed");
      recordOutcome("succeeded");
      logger.info({ jobId: id }, "Generated captions completed");
      return;
    }

    if (job.preset === "burn-subtitles" && !job.subtitlePath) {
      throw new Error("Attach an SRT/VTT caption file or select Generate Captions from Audio before burning subtitles.");
    }

    job.outputPath = outputPath;
    const deterministicArgs = deterministicPresetArgs(job, outputPath, job.subtitlePath ?? undefined);
    const instruction = job.prompt.trim() || presetInstruction(job.preset);
    const attemptLimit = deterministicArgs ? 1 : maxAttempts;
    let stderr = "";

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      job.attempt = attempt;
      let args: string[];

      if (deterministicArgs) {
        event(job, `Preparing verified ${job.preset} recipe.`, 65, "rendering");
        args = deterministicArgs;
      } else {
        if (attempt > 1) {
          job.status = "healing";
          event(job, "GOLD · Sending raw FFmpeg stderr to Gemini for argument repair.", 58, "repairing");
          recordSelfHealEvent(stderr);
        } else {
          job.status = "processing";
          event(job, "Gemini planning request sent. Parallel is grounding media guidance.", 35, "planning");
        }

        try {
          const plannedArgs = await generateFfmpegArgs({
            instruction,
            filename: job.filename,
            outputKind: outputExtension === ".mp3" ? "audio" : "video",
            stderr: attempt > 1 ? stderr : undefined,
          });
          args = resolveFfmpegArgs(plannedArgs, job.inputPath, outputPath);
          const parallel = getParallelStatus();
          event(job, `Gemini returned a safe JSON FFmpeg plan · Parallel grounding: ${parallel.state}.`, 58, "rendering");
        } catch (error) {
          fail(error instanceof Error ? error.message : "Gemini could not create FFmpeg arguments.");
          return;
        }
      }

      event(job, `Render attempt ${attempt}/${attemptLimit} started.`, 72, "rendering");
      const result = await runFfmpeg(args);
      stderr = result.stderr;
      const outputStats = await stat(outputPath).catch(() => null);

      if (result.code === 0 && outputStats && outputStats.size > 0) {
        job.status = "succeeded";
        job.completedAt = new Date().toISOString();
        job.outputFilename = outputFilename;
        job.outputUrl = `/api/media/jobs/${id}/output`;
        job.outputMimeType = outputExtension === ".mp3" ? "audio/mpeg" : "video/mp4";
        job.error = null;
        event(job, `GREEN · Render complete. Output verified at ${outputFilename}.`, 100, "completed");
        recordOutcome("succeeded");
        logger.info({ jobId: id, attempt }, "Media job completed");
        return;
      }

      job.error = stderr.trim() || "FFmpeg exited without producing a verified output.";
      event(job, `RED · Attempt ${attempt} failed: ${job.error.slice(-420)}`, 74, "render-failed");
    }

    fail("Render stopped after the Gemini repair limit. The source file is untouched.");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Media processing could not complete.");
  }
}

export async function getJobsRoot(): Promise<string> {
  await mkdir(jobsRoot, { recursive: true });
  return jobsRoot;
}
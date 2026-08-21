import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type SubtitleFormat = "srt" | "vtt";

const MAX_SUBTITLE_BYTES = 10 * 1024 * 1024;
const TIMESTAMP = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g;

function toMilliseconds(parts: number[]): number {
  return (((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000) + parts[3];
}

function validateText(text: string, format: SubtitleFormat, sourceDurationSeconds?: number): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.includes("\u0000") || /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
    throw new Error("Subtitle file must contain valid readable text.");
  }
  if (format === "vtt" && !/^WEBVTT(?:\s|$)/i.test(normalized)) {
    throw new Error("VTT subtitle files must begin with WEBVTT.");
  }

  const matches = [...normalized.matchAll(TIMESTAMP)];
  if (matches.length === 0 || matches.length > 20_000) {
    throw new Error("Subtitle file must contain between 1 and 20,000 timed captions.");
  }
  let latestEnd = 0;
  for (const match of matches) {
    const start = toMilliseconds([
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
    ]);
    const end = toMilliseconds([
      Number(match[5]),
      Number(match[6]),
      Number(match[7]),
      Number(match[8]),
    ]);
    if (end <= start) throw new Error("Subtitle timestamps must end after they start.");
    latestEnd = Math.max(latestEnd, end);
  }
  if (sourceDurationSeconds !== undefined && latestEnd > (sourceDurationSeconds + 2) * 1000) {
    throw new Error("Generated caption timing extends beyond the inspected source duration.");
  }
  return `${normalized}\n`;
}

export async function validateSubtitleFile(filePath: string, originalName: string): Promise<{ format: SubtitleFormat; text: string }> {
  const extension = path.extname(path.basename(originalName)).toLowerCase().slice(1);
  if (extension !== "srt" && extension !== "vtt") {
    throw new Error("Subtitle files must use the .srt or .vtt format.");
  }
  const fileStats = await stat(filePath);
  if (fileStats.size > MAX_SUBTITLE_BYTES) {
    throw new Error("Subtitle files must be 10 MB or smaller.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(filePath));
  } catch {
    throw new Error("Subtitle file must be valid UTF-8 text.");
  }
  return { format: extension, text: validateText(text, extension) };
}

export function validateGeneratedSrt(text: string, sourceDurationSeconds: number): string {
  return validateText(text, "srt", sourceDurationSeconds);
}
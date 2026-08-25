import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type SubtitleFormat = "srt" | "vtt";

const MAX_SUBTITLE_BYTES = 10 * 1024 * 1024;
const TIMESTAMP = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})[ \t]+-->[ \t]+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g;
const TIMESTAMP_LINE = /^(\d{2}:\d{2}:\d{2}[,.]\d{3})[ \t]+-->[ \t]+(\d{2}:\d{2}:\d{2}[,.]\d{3})[ \t]*$/gm;

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

  const repairedForValidation = format === "srt"
    ? normalized.replace(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})[ \t]*-->[ \t]*\n[ \t]*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g,
      "$1 --> $2",
    )
    : normalized;
  const matches = [...repairedForValidation.matchAll(TIMESTAMP)];
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
  if (format === "srt") {
    const repaired = repairedForValidation;
    const cueHeaders = [...repaired.matchAll(TIMESTAMP_LINE)];
    const cues: string[] = [];
    cueHeaders.forEach((header, index) => {
      const bodyStart = (header.index ?? 0) + header[0].length;
      const bodyEnd = cueHeaders[index + 1]?.index ?? repaired.length;
      let caption = repaired.slice(bodyStart, bodyEnd).trim();
      // A cue number can sit between the caption and the next timestamp when
      // the input omitted a blank line. It is metadata, not caption text.
      caption = caption.replace(/\n\s*\d+\s*$/, "").trim();
      if (caption) {
        cues.push(`${cues.length + 1}\n${header[1].replace(".", ",")} --> ${header[2].replace(".", ",")}\n${caption}`);
      }
    });
    if (cues.length === 0) throw new Error("SRT file contains no readable caption text.");
    return `${cues.join("\n\n")}\n`;
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

export type TimedSubtitleWord = { word: string; start: number; end: number };

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function assText(value: string): string {
  return value.replace(/[{}\r\n]/g, " ").replace(/\s+/g, " ").trim();
}

export function generateAssWithKaraokeHighlight(words: TimedSubtitleWord[], options?: { playResX?: number; playResY?: number }): string {
  const safeWords = words
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .map((item) => ({ ...item, word: assText(item.word) }))
    .filter((item) => item.word)
    .slice(0, 50_000);
  const playResX = options?.playResX ?? 1080;
  const playResY = options?.playResY ?? 1920;
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: CarterPC,Arial Black,48,&H00FFFFFF,&H00FFFF00,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,4,2,2,40,40,650,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (let index = 0; index < safeWords.length; index += 4) {
    const group = safeWords.slice(index, index + 4);
    const lineStart = group[0].start;
    const lineEnd = group[group.length - 1].end;
    for (const active of group) {
      const text = group.map((word) => word === active
        ? `{\\c&H00FFFF&}${word.word}{\\c&HFFFFFF&}`
        : word.word
      ).join(" ");
      lines.push(`Dialogue: 0,${assTime(active.start)},${assTime(active.end)},CarterPC,,0,0,0,,${text}`);
    }
    // Keep a short group visible if a provider returns a very small gap.
    if (lineEnd <= lineStart) continue;
  }
  return `${lines.join("\n")}\n`;
}
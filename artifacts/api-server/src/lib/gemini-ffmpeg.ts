import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const GeminiArgsPayload = z.object({
  args: z.array(z.string()).min(3).max(80),
});

const forbiddenToken = /[\u0000\r\n;|&$<>`]/;
const inputPlaceholder = "__INPUT__";
const outputPlaceholder = "__OUTPUT__";

function requireApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Gemini is not configured. Add GEMINI_API_KEY in Replit Secrets to enable natural-language FFmpeg generation.",
    );
  }
  return apiKey;
}

function parseResponse(text: string | undefined): string[] {
  if (!text) {
    throw new Error("Gemini returned an empty FFmpeg argument payload.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON for the FFmpeg argument payload.");
  }

  const parsed = GeminiArgsPayload.safeParse(decoded);
  if (!parsed.success) {
    throw new Error("Gemini returned an invalid FFmpeg argument payload.");
  }

  const args = parsed.data.args;
  if (args.filter((arg) => arg === "-i").length !== 1) {
    throw new Error("Gemini must return exactly one FFmpeg input flag.");
  }

  const inputIndex = args.indexOf("-i");
  if (args[inputIndex + 1] !== inputPlaceholder || args.at(-1) !== outputPlaceholder) {
    throw new Error("Gemini must use the server-owned input and output placeholders.");
  }

  if (
    args.some(
      (arg) =>
        forbiddenToken.test(arg) ||
        (arg.includes("/") && !arg.includes(inputPlaceholder) && !arg.includes(outputPlaceholder)),
    )
  ) {
    throw new Error("Gemini returned an unsafe FFmpeg argument.");
  }

  return args;
}

export async function generateFfmpegArgs(input: {
  instruction: string;
  filename: string;
  stderr?: string;
}): Promise<string[]> {
  const client = new GoogleGenAI({ apiKey: requireApiKey() });
  const repairContext = input.stderr
    ? `\n\nThe previous FFmpeg attempt failed. Rewrite the arguments using this raw stderr exactly as diagnostic context:\n---\n${input.stderr}\n---`
    : "";
  const prompt = `You are MediaCraft AI, an expert FFmpeg command planner for filmmakers.

Translate the raw natural-language instruction below into one safe FFmpeg argument array.
Return JSON only in exactly this shape: {"args":["-y","-i","__INPUT__","...","__OUTPUT__"]}.
The array will be passed directly to spawn("ffmpeg", args), never through a shell.
Use exactly one "-i" followed by "__INPUT__". The final array item must be "__OUTPUT__".
Do not include executable names, shell syntax, absolute paths, relative paths, URLs, or extra input files.
Use conservative, widely available FFmpeg codecs and filters. Preserve audio when the instruction asks for video.
The input filename is only context: ${input.filename}

Raw instruction:
${input.instruction.slice(0, 2000)}
${repairContext}`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });

  return parseResponse(response.text);
}

export function resolveFfmpegArgs(
  args: string[],
  inputPath: string,
  outputPath: string,
): string[] {
  return args.map((arg) =>
    arg.replaceAll(inputPlaceholder, inputPath).replaceAll(outputPlaceholder, outputPath),
  );
}
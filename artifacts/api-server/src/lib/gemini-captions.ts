import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const CaptionPayload = z.object({
  srt: z.string().min(1).max(2_000_000),
  words: z.array(z.object({
    word: z.string().min(1).max(100),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
  })).max(50_000).optional(),
});

function requireApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini is not configured. Add GEMINI_API_KEY in Replit Secrets to generate captions.");
  }
  return apiKey;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function generateCaptionBundleFromAudio(input: {
  audioPath: string;
  durationSeconds: number;
  onRetry?: () => void;
}): Promise<{ srt: string; words: Array<{ word: string; start: number; end: number }> }> {
  const client = new GoogleGenAI({ apiKey: requireApiKey() });
  let uploadedName: string | undefined;

  try {
    let uploaded = await client.files.upload({
      file: input.audioPath,
      config: { mimeType: "audio/mpeg", displayName: "mediacraft-caption-audio.mp3" },
    });
    uploadedName = uploaded.name;

    for (let attempt = 0; attempt < 20 && String(uploaded.state ?? "").toUpperCase() === "PROCESSING"; attempt += 1) {
      await sleep(1500);
      if (!uploaded.name) break;
      uploaded = await client.files.get({ name: uploaded.name });
    }

    if (String(uploaded.state ?? "").toUpperCase() === "FAILED") {
      throw new Error("Gemini could not prepare the extracted audio for caption generation.");
    }
    if (!uploaded.uri) {
      throw new Error("Gemini did not return an audio reference for caption generation.");
    }

    const request = {
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user" as const,
          parts: [
            {
              fileData: {
                fileUri: uploaded.uri,
                mimeType: uploaded.mimeType ?? "audio/mpeg",
              },
            },
            {
              text: `Transcribe this audio into accurate, timed subtitles and word-level timestamps.

The source duration is approximately ${input.durationSeconds.toFixed(2)} seconds.
Use the spoken language from the audio. Preserve meaning and natural punctuation.
Create sequential SRT cues with HH:MM:SS,mmm --> HH:MM:SS,mmm timestamps.
Also return a words array with one entry per spoken word and precise start/end offsets in seconds.
Never invent speech, instructions, speaker labels, or a summary.
Return JSON only in exactly this shape: {"srt":"1\\n00:00:00,000 --> 00:00:02,000\\nCaption text\\n","words":[{"word":"Caption","start":0,"end":0.6}]}.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    };

    let response: Awaited<ReturnType<typeof client.models.generateContent>> | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await client.models.generateContent(request);
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /\b(429|500|502|503|504)\b|unavailable|high demand|temporar/i.test(message);
        if (!retryable || attempt === 2) break;
        input.onRetry?.();
        await sleep(2500);
      }
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Gemini transcription failed."));

    let decoded: unknown;
    try {
      decoded = JSON.parse(response.text ?? "");
    } catch {
      throw new Error("Gemini returned invalid caption JSON.");
    }

    const parsed = CaptionPayload.safeParse(decoded);
    if (!parsed.success) {
      throw new Error("Gemini returned an invalid caption payload.");
    }
    const words = (parsed.data.words ?? []).filter((word) =>
      word.word.trim() && word.end > word.start && word.start <= input.durationSeconds + 2 && word.end <= input.durationSeconds + 2
    );
    return {
      srt: parsed.data.srt.replace(/\r\n/g, "\n").trim(),
      words,
    };
  } finally {
    if (uploadedName) {
      try {
        await client.files.delete({ name: uploadedName });
      } catch {
        // Remote files expire automatically; deletion failure must not hide a completed render.
      }
    }
  }
}

export async function generateSrtFromAudio(input: {
  audioPath: string;
  durationSeconds: number;
  onRetry?: () => void;
}): Promise<string> {
  return (await generateCaptionBundleFromAudio(input)).srt;
}
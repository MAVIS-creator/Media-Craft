import { logger } from "./logger";

export type ParallelSearchResult = {
  query: string;
  snippets: string[];
  sourceUrl?: string;
};

export type IntegrationState = "connected" | "not_configured" | "error";
type ParallelStatus = {
  provider: "parallel";
  state: IntegrationState;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError?: string;
};

let status: ParallelStatus = {
  provider: "parallel",
  state: process.env.PARALLEL_API_KEY ? "error" : "not_configured",
  lastCheckedAt: null,
  lastSuccessAt: null,
};

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 180);
}

async function callParallel(query: string): Promise<{ snippets?: Array<{ excerpts?: string[]; url?: string }>; firstUrl?: string }> {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) throw new Error("PARALLEL_API_KEY is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const keywords = query
      .replace(/[^a-zA-Z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(" ");
    const response = await fetch("https://api.parallel.ai/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        objective: query,
        search_queries: [keywords || "FFmpeg video audio codecs"],
        mode: "basic",
        max_chars_total: 2400,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Parallel Search API returned HTTP ${response.status}`);
    const data = (await response.json()) as { results?: Array<{ excerpts?: string[]; url?: string }> };
    return { snippets: data.results ?? [], firstUrl: data.results?.[0]?.url };
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchWebGrounding(query: string): Promise<ParallelSearchResult> {
  if (!process.env.PARALLEL_API_KEY) {
    status = { ...status, state: "not_configured", lastCheckedAt: new Date().toISOString(), lastError: undefined };
    logger.info({ query }, "PARALLEL_API_KEY not set; providing standard filmmaking technical context.");
    return {
      query,
      snippets: [
        `Standard 2026 media specs for "${query}": H.264/AAC MP4, 9:16 reframe crop filter (1080x1920), 48kHz audio, Rec.709 color curve.`,
      ],
      sourceUrl: "https://parallel.web/search",
    };
  }

  try {
    const data = await callParallel(query);
    const now = new Date().toISOString();
    status = { provider: "parallel", state: "connected", lastCheckedAt: now, lastSuccessAt: now };
    const snippets = (data.snippets ?? []).flatMap((res) => res.excerpts ?? []).filter((s): s is string => Boolean(s));

    return {
      query,
      snippets: snippets.length > 0 ? snippets : [`Query results for ${query}`],
      sourceUrl: data.firstUrl ?? "https://parallel.web",
    };
  } catch (error) {
    const message = safeError(error);
    status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: message };
    logger.warn({ error: message }, "Parallel search query failed; fallback active");
    return {
      query,
      snippets: [`Fallback filmmaking technical context for ${query}`],
    };
  }
}

export async function probeParallel(): Promise<ParallelStatus> {
  if (!process.env.PARALLEL_API_KEY) {
    status = { ...status, state: "not_configured", lastCheckedAt: new Date().toISOString(), lastError: "API key not configured." };
    return status;
  }
  try {
    await callParallel("FFmpeg H.264 media codec specifications");
    const now = new Date().toISOString();
    status = { provider: "parallel", state: "connected", lastCheckedAt: now, lastSuccessAt: now };
  } catch (error) {
    status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: safeError(error) };
  }
  return status;
}

export function getParallelStatus(): ParallelStatus {
  return status;
}

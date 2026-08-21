import { logger } from "./logger";

export type GrafanaTelemetryMetrics = {
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  selfHealAttempts: number;
  totalTokensUsed: number;
  lastFfmpegError?: string;
  grafanaMcpConnected: boolean;
  endpoint: string;
};

export type GrafanaStatus = {
  provider: "grafana";
  state: "connected" | "not_configured" | "error";
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError?: string;
  lastWriteAt: string | null;
};

let selfHealCount = 0;
let totalTokens = 0;
let lastFfmpegErr = "";
let status: GrafanaStatus = {
  provider: "grafana",
  state: process.env.GRAFANA_URL && process.env.GRAFANA_API_KEY ? "error" : "not_configured",
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastWriteAt: null,
};

function grafanaUrl(path: string): string | null {
  const base = process.env.GRAFANA_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 180);
}

async function grafanaRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = grafanaUrl(path);
  const apiKey = process.env.GRAFANA_API_KEY;
  if (!url || !apiKey) throw new Error("Grafana URL or API key is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Grafana returned HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export function recordSelfHealEvent(err: string) {
  selfHealCount += 1;
  lastFfmpegErr = err.slice(-300);
}

export function recordTokenUsage(tokens: number) {
  totalTokens += tokens;
}

export function getGrafanaTelemetry(jobStats: { active: number; completed: number; failed: number }): GrafanaTelemetryMetrics {
  const mcpEndpoint = process.env.GRAFANA_MCP_ENDPOINT ?? "https://mcp.grafana.com/mcp";
  return {
    activeJobs: jobStats.active,
    completedJobs: jobStats.completed,
    failedJobs: jobStats.failed,
    selfHealAttempts: selfHealCount,
    totalTokensUsed: totalTokens,
    lastFfmpegError: lastFfmpegErr || undefined,
    grafanaMcpConnected: status.state === "connected",
    endpoint: mcpEndpoint,
  };
}

export async function probeGrafana(): Promise<GrafanaStatus> {
  if (!grafanaUrl("/api/health") || !process.env.GRAFANA_API_KEY) {
    status = { ...status, state: "not_configured", lastCheckedAt: new Date().toISOString(), lastError: "Grafana URL or API key not configured." };
    return status;
  }
  try {
    await grafanaRequest("/api/health", { method: "GET" });
    const now = new Date().toISOString();
    status = { ...status, state: "connected", lastCheckedAt: now, lastSuccessAt: now };
  } catch (error) {
    status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: safeError(error) };
  }
  return status;
}

export function recordGrafanaJobEvent(input: { jobId: string; status: "succeeded" | "failed"; preset: string; durationSeconds: number }) {
  void (async () => {
    if (!grafanaUrl("/api/annotations") || !process.env.GRAFANA_API_KEY) return;
    try {
      await grafanaRequest("/api/annotations", {
        method: "POST",
        body: JSON.stringify({
          time: Date.now(),
          tags: ["mediacraft", "media-job", input.status, input.preset],
          text: `MediaCraft job ${input.jobId} ${input.status} · ${input.durationSeconds.toFixed(1)}s`,
        }),
      });
      const now = new Date().toISOString();
      status = { provider: "grafana", state: "connected", lastCheckedAt: now, lastSuccessAt: now, lastWriteAt: now };
      logger.info({ jobId: input.jobId, status: input.status }, "Sent MediaCraft job annotation to Grafana");
    } catch (error) {
      const message = safeError(error);
      status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: message };
      logger.warn({ jobId: input.jobId, error: message }, "Grafana job annotation failed");
    }
  })();
}

export function getGrafanaStatus(): GrafanaStatus {
  return status;
}

export async function connectGrafanaMcpClient() {
  const result = await probeGrafana();
  return result.state === "connected";
}
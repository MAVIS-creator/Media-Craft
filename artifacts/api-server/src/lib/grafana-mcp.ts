import { ReplitConnectors, type ProxyOptions } from "@replit/connectors-sdk";
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
  state: "not_configured",
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastWriteAt: null,
};

function safeError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 180);
  if (message.includes("HTTP 500") && message.includes("fetch failed")) {
    return "Grafana connector could not reach the configured stack. Check the Grafana base URL in the Replit connection.";
  }
  if (message.includes("HTTP 503")) {
    return "Grafana is unavailable; media processing continues without telemetry.";
  }
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    return "Grafana rejected the connected service account or its permissions; media processing continues without telemetry.";
  }
  return message;
}

async function grafanaRequest(path: string, init: ProxyOptions = {}): Promise<Response> {
  // Construct this per request so the SDK can renew the Replit identity used by
  // the connector proxy. Grafana credentials never enter application code.
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("grafana", path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
      detail = parsed.error?.message ?? parsed.message ?? "";
    } catch {
      detail = body;
    }
    throw new Error(`Grafana connector returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 100)}` : ""}`);
  }
  return response;
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
  try {
    await grafanaRequest("/api/health", { method: "GET" });
    const now = new Date().toISOString();
    status = { ...status, state: "connected", lastCheckedAt: now, lastSuccessAt: now, lastError: undefined };
  } catch (error) {
    status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: safeError(error) };
  }
  return status;
}

export function recordGrafanaJobEvent(input: { jobId: string; status: "succeeded" | "failed"; preset: string; durationSeconds: number }) {
  void (async () => {
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
      status = { provider: "grafana", state: "connected", lastCheckedAt: now, lastSuccessAt: now, lastWriteAt: now, lastError: undefined };
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
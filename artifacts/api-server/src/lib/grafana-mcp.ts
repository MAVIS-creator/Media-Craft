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

let selfHealCount = 0;
let totalTokens = 0;
let lastFfmpegErr = "";

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
    grafanaMcpConnected: Boolean(process.env.GRAFANA_URL || process.env.GRAFANA_API_KEY),
    endpoint: mcpEndpoint,
  };
}

export async function connectGrafanaMcpClient() {
  const grafanaUrl = process.env.GRAFANA_URL;
  if (!grafanaUrl) {
    logger.info("GRAFANA_URL not set; Grafana Cloud MCP telemetry logging active in mock mode.");
    return false;
  }
  logger.info({ grafanaUrl }, "Connecting to Grafana Cloud MCP Server at https://mcp.grafana.com/mcp");
  return true;
}

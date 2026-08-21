import { logger } from "./logger";

export type ClickHouseMediaRecord = {
  jobId: string;
  filename: string;
  preset: string;
  durationSeconds: number;
  videoCodec: string | null;
  audioCodec: string | null;
  status: string;
  attempts: number;
  timestamp: string;
};

export type ClickHouseStatus = {
  provider: "clickhouse";
  state: "connected" | "not_configured" | "error";
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError?: string;
  lastWriteAt: string | null;
};

const analyticsLogs: ClickHouseMediaRecord[] = [];
let tableInitialized = false;
let status: ClickHouseStatus = {
  provider: "clickhouse",
  state: process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST ? "error" : "not_configured",
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastWriteAt: null,
};

function connectionUrl(): string | null {
  const url = process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST;
  return url ? url.replace(/\/+$/, "") : null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 180);
}

async function clickhouseRequest(query: string, body?: string): Promise<void> {
  const url = connectionUrl();
  const password = process.env.CLICKHOUSE_PASSWORD;
  if (!url || !password) throw new Error("ClickHouse URL or password is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const credentials = Buffer.from(`${process.env.CLICKHOUSE_USER || "default"}:${password}`).toString("base64");
    const response = await fetch(`${url}/?query=${encodeURIComponent(query)}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ClickHouse returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureTable(): Promise<void> {
  if (tableInitialized) return;
  await clickhouseRequest(`
    CREATE TABLE IF NOT EXISTS mediacraft_jobs (
      jobId String,
      filename String,
      preset String,
      durationSeconds Float64,
      videoCodec Nullable(String),
      audioCodec Nullable(String),
      status String,
      attempts UInt8,
      timestamp String
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, jobId)
  `);
  tableInitialized = true;
}

export function logToClickHouse(record: ClickHouseMediaRecord) {
  analyticsLogs.push(record);
  if (analyticsLogs.length > 500) analyticsLogs.shift();

  void (async () => {
    if (!connectionUrl() || !process.env.CLICKHOUSE_PASSWORD) {
      status = {
        ...status,
        state: "not_configured",
        lastCheckedAt: new Date().toISOString(),
        lastError: "ClickHouse URL or password not configured.",
      };
      logger.info({ jobId: record.jobId, status: record.status }, "Recorded job metrics to ClickHouse in-memory buffer");
      return;
    }

    try {
      await ensureTable();
      await clickhouseRequest("INSERT INTO mediacraft_jobs FORMAT JSONEachRow", `${JSON.stringify(record)}\n`);
      const now = new Date().toISOString();
      status = { provider: "clickhouse", state: "connected", lastCheckedAt: now, lastSuccessAt: now, lastWriteAt: now };
      logger.info({ jobId: record.jobId }, "Persisted media job record to ClickHouse Cloud table mediacraft_jobs");
    } catch (error) {
      const message = safeError(error);
      status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: message };
      logger.warn({ jobId: record.jobId, error: message }, "ClickHouse insert fallback to local store");
    }
  })();
}

export async function probeClickHouse(): Promise<ClickHouseStatus> {
  if (!connectionUrl() || !process.env.CLICKHOUSE_PASSWORD) {
    status = {
      ...status,
      state: "not_configured",
      lastCheckedAt: new Date().toISOString(),
      lastError: "ClickHouse URL or password not configured.",
    };
    return status;
  }
  try {
    await clickhouseRequest("SELECT 1");
    const now = new Date().toISOString();
    status = { ...status, state: "connected", lastCheckedAt: now, lastSuccessAt: now };
  } catch (error) {
    status = { ...status, state: "error", lastCheckedAt: new Date().toISOString(), lastError: safeError(error) };
  }
  return status;
}

export function getClickHouseStatus(): ClickHouseStatus {
  return status;
}

export function queryClickHouseAnalytics(filter?: { status?: string; codec?: string; preset?: string }) {
  let result = [...analyticsLogs];
  if (filter?.status) result = result.filter((r) => r.status.toLowerCase() === filter.status?.toLowerCase());
  if (filter?.preset) result = result.filter((r) => r.preset.toLowerCase() === filter.preset?.toLowerCase());
  if (filter?.codec) {
    const searchCodec = filter.codec.toLowerCase();
    result = result.filter(
      (r) => (r.videoCodec && r.videoCodec.toLowerCase().includes(searchCodec)) || (r.audioCodec && r.audioCodec.toLowerCase().includes(searchCodec)),
    );
  }
  return {
    totalRecords: result.length,
    clickhouseMcpConnected: status.state === "connected",
    records: result,
  };
}
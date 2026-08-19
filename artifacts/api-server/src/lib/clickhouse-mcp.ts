import { createClient, type ClickClient } from "@clickhouse/client";
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

const analyticsLogs: ClickHouseMediaRecord[] = [];
let clickhouseClient: ClickClient | null = null;
let tableInitialized = false;

function getClickHouseClient(): ClickClient | null {
  if (clickhouseClient) return clickhouseClient;

  const url = process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST;
  if (!url) return null;

  try {
    clickhouseClient = createClient({
      url,
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
      database: process.env.CLICKHOUSE_DATABASE || "default",
    });
    return clickhouseClient;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Failed to initialize ClickHouse client");
    return null;
  }
}

async function ensureTable(client: ClickClient): Promise<void> {
  if (tableInitialized) return;
  try {
    await client.command({
      query: `
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
      `,
    });
    tableInitialized = true;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "ClickHouse CREATE TABLE skipped or failed");
  }
}

export function logToClickHouse(record: ClickHouseMediaRecord) {
  analyticsLogs.push(record);
  if (analyticsLogs.length > 500) {
    analyticsLogs.shift();
  }

  const client = getClickHouseClient();
  if (client) {
    void (async () => {
      try {
        await ensureTable(client);
        await client.insert({
          table: "mediacraft_jobs",
          values: [record],
          format: "JSONEachRow",
        });
        logger.info({ jobId: record.jobId }, "Persisted media job record to ClickHouse Cloud table mediacraft_jobs");
      } catch (error) {
        logger.warn({ jobId: record.jobId, error: error instanceof Error ? error.message : String(error) }, "ClickHouse insert fallback to local store");
      }
    })();
  } else {
    logger.info({ jobId: record.jobId, status: record.status }, "Recorded job metrics to ClickHouse in-memory buffer");
  }
}

export function queryClickHouseAnalytics(filter?: { status?: string; codec?: string; preset?: string }) {
  let result = [...analyticsLogs];
  if (filter?.status) {
    result = result.filter((r) => r.status.toLowerCase() === filter.status?.toLowerCase());
  }
  if (filter?.preset) {
    result = result.filter((r) => r.preset.toLowerCase() === filter.preset?.toLowerCase());
  }
  if (filter?.codec) {
    const searchCodec = filter.codec.toLowerCase();
    result = result.filter(
      (r) => (r.videoCodec && r.videoCodec.toLowerCase().includes(searchCodec)) || (r.audioCodec && r.audioCodec.toLowerCase().includes(searchCodec))
    );
  }
  return {
    totalRecords: result.length,
    clickhouseMcpConnected: Boolean(process.env.CLICKHOUSE_HOST || process.env.CLICKHOUSE_URL),
    records: result,
  };
}

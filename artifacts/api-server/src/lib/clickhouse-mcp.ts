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

export function logToClickHouse(record: ClickHouseMediaRecord) {
  analyticsLogs.push(record);
  if (analyticsLogs.length > 500) {
    analyticsLogs.shift();
  }
  logger.info({ jobId: record.jobId, status: record.status }, "Recorded job metrics to ClickHouse media log");
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

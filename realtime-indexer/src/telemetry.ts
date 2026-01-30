import { ENV } from "./env.js";

export type TelemetrySnapshot = {
  service: string;
  ts: number;
  ok: boolean;
  // App-level
  rps_1m?: number;
  errors_1m?: number;
  // Indexer-level
  last_indexed_block?: number;
  head_block?: number;
  lag_blocks?: number;
  last_indexer_run_ms_ago?: number;
  last_indexer_error_ms_ago?: number;
  // Process
  mem_mb?: number;
};

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function memMb() {
  const rss = process.memoryUsage().rss;
  return Math.round((rss / 1024 / 1024) * 10) / 10;
}

async function postJson(url: string, token: string, payload: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telemetry-token": token,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`telemetry ingest failed: ${res.status} ${txt}`);
  }
}

/**
 * Starts a lightweight telemetry reporter.
 *
 * This MUST be safe during viral load:
 * - One small POST per interval
 * - No heavy DB queries (caller can decide what to include)
 */
export function startTelemetryReporter(getSnapshot: () => Promise<TelemetrySnapshot>) {
  const ingestUrl = (ENV.TELEMETRY_INGEST_URL || "").trim();
  const token = (ENV.TELEMETRY_TOKEN || "").trim();
  if (!ingestUrl || !token) return;

  const intervalMs = ENV.TELEMETRY_INTERVAL_MS;

  setInterval(async () => {
    try {
      const snap = await getSnapshot();
      // Ensure required fields
      const payload = {
        ...snap,
        ts: snap.ts || nowSec(),
        mem_mb: snap.mem_mb ?? memMb(),
      };
      await postJson(ingestUrl, token, payload);
    } catch (e) {
      // Do not crash the process if telemetry fails
      console.warn("telemetry reporter error", e);
    }
  }, intervalMs);
}

// frontend/src/lib/chart/buildCandles.ts

export type ChartPoint = {
  /** Unix timestamp in seconds (chain / DB style). */
  timestamp: number;
  /** The value to chart (e.g. pricePerToken, mcap, etc.). */
  value: number;
  /** Optional volume for the bucket (any unit you prefer: native, USD, etc.). */
  volume?: number;
};

export type Candle = {
  /** Unix seconds (bucket start). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type VolumeBar = {
  /** Unix seconds (bucket start). */
  time: number;
  value: number;
};

/**
 * Bucket raw trade points into OHLC candles + volume bars.
 * - Expects timestamps in SECONDS.
 * - Lightweight Charts expects `time` in SECONDS.
 */
export function buildCandles(
  points: ChartPoint[],
  intervalSec: number
): { candles: Candle[]; volumes: VolumeBar[] } {
  if (!Array.isArray(points) || points.length === 0) return { candles: [], volumes: [] };

  const sorted = [...points]
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (sorted.length === 0) return { candles: [], volumes: [] };

  const candles: Candle[] = [];
  const volumes: VolumeBar[] = [];

  let bucketStart = Math.floor(sorted[0].timestamp / intervalSec) * intervalSec;

  let open = sorted[0].value;
  let high = sorted[0].value;
  let low = sorted[0].value;
  let close = sorted[0].value;
  let vol = sorted[0].volume ?? 0;

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const b = Math.floor(p.timestamp / intervalSec) * intervalSec;

    if (b !== bucketStart) {
      candles.push({ time: bucketStart, open, high, low, close });
      volumes.push({ time: bucketStart, value: vol });

      bucketStart = b;
      open = p.value;
      high = p.value;
      low = p.value;
      close = p.value;
      vol = p.volume ?? 0;
      continue;
    }

    high = Math.max(high, p.value);
    low = Math.min(low, p.value);
    close = p.value;
    vol += p.volume ?? 0;
  }

  candles.push({ time: bucketStart, open, high, low, close });
  volumes.push({ time: bucketStart, value: vol });

  return { candles, volumes };
}

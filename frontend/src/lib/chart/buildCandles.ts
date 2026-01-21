// frontend/src/lib/chart/buildCandles.ts

export type ChartPoint = {
  timestamp: number; // unix seconds
  value: number;
};

export type Candle = {
  time: number; // unix seconds bucket start
  open: number;
  high: number;
  low: number;
  close: number;
};

type BuildOptions = {
  /**
   * If true, fills candles all the way up to "now", even if there are no trades.
   * This makes 5s/1m/etc continue printing flat candles like TradingView.
   */
  extendToNow?: boolean;

  /**
   * Optional override for "now" (unix seconds). Useful for testing.
   */
  nowSec?: number;
};

export function buildCandles(points: ChartPoint[], intervalSec: number, opts?: BuildOptions): Candle[] {
  if (!Array.isArray(points) || points.length === 0) {
    // If no points at all, we cannot infer a price to print.
    return [];
  }

  const sorted = [...points]
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (sorted.length === 0) return [];

  const bucketOf = (t: number) => Math.floor(t / intervalSec) * intervalSec;

  // Aggregate trades into buckets
  const map = new Map<number, { open: number; high: number; low: number; close: number }>();
  for (const p of sorted) {
    const b = bucketOf(p.timestamp);
    const existing = map.get(b);
    if (!existing) {
      map.set(b, { open: p.value, high: p.value, low: p.value, close: p.value });
    } else {
      existing.high = Math.max(existing.high, p.value);
      existing.low = Math.min(existing.low, p.value);
      existing.close = p.value;
    }
  }

  const firstBucket = bucketOf(sorted[0].timestamp);
  const lastTradeBucket = bucketOf(sorted[sorted.length - 1].timestamp);

  const nowSec = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  const lastBucket = opts?.extendToNow ? Math.max(lastTradeBucket, bucketOf(nowSec)) : lastTradeBucket;

  const candles: Candle[] = [];
  let prevClose = map.get(firstBucket)?.close ?? sorted[0].value;

  for (let t = firstBucket; t <= lastBucket; t += intervalSec) {
    const b = map.get(t);
    if (b) {
      candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
      prevClose = b.close;
    } else {
      candles.push({ time: t, open: prevClose, high: prevClose, low: prevClose, close: prevClose });
    }
  }

  return candles;
}

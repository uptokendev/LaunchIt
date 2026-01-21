// frontend/src/components/token/CurvePriceChart.tsx
// TradingView-style bonding-curve chart using TradingView Lightweight Charts (free).

import { useMemo, useState } from "react";
import { ethers } from "ethers";

import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { CurveTradesChart } from "@/lib/chart/CurveTradesChart";
import type { ChartPoint } from "@/lib/chart/buildCandles";

import type { MockCurveEvent } from "@/constants/mockCurveTrades";

type CurvePriceChartProps = {
  campaignAddress?: string;
  mockMode?: boolean;
  mockEvents?: MockCurveEvent[];
  /** Optional override to avoid opening additional realtime connections in child components. */
  curvePointsOverride?: CurveTradePoint[];
  loadingOverride?: boolean;
  errorOverride?: string | null;
};

type TimeframeKey = "5s" | "1m" | "5m" | "15m" | "1h";

const TIMEFRAMES: Array<{ key: TimeframeKey; label: string; seconds: number }> = [
  { key: "5s", label: "5s", seconds: 5 },
  { key: "1m", label: "1m", seconds: 60 },
  { key: "5m", label: "5m", seconds: 5 * 60 },
  { key: "15m", label: "15m", seconds: 15 * 60 },
  { key: "1h", label: "1h", seconds: 60 * 60 },
];

function bnbFromWeiSafe(wei: bigint | undefined | null): number {
  try {
    if (!wei) return 0;
    const n = Number(ethers.formatEther(wei));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * CurvePriceChart
 * - Uses the shared realtime hook (or override props from TokenDetails)
 * - Buckets trades into candles
 * - Renders TradingView-like chart behaviour (pan/zoom/grid/volume)
 */
export const CurvePriceChart = ({
  campaignAddress,
  mockMode = false,
  mockEvents = [],
  curvePointsOverride,
  loadingOverride,
  errorOverride,
}: CurvePriceChartProps) => {
  const [tf, setTf] = useState<TimeframeKey>("1m");

  // Live data (disabled when TokenDetails passes override to avoid duplicate websockets)
  const live = useCurveTrades(campaignAddress, { enabled: !curvePointsOverride });
  const livePoints = curvePointsOverride ?? live.points;
  const liveLoading = loadingOverride ?? live.loading;
  const liveError = errorOverride ?? live.error;

  const bucketSec = useMemo(() => TIMEFRAMES.find((t) => t.key === tf)?.seconds ?? 60, [tf]);

  // Build chart points (timestamp in seconds)
  const chartPoints: ChartPoint[] = useMemo(() => {
    if (mockMode) {
      return (mockEvents || [])
        .map((e) => ({
          timestamp: Number(e.timestamp ?? 0),
          value: Number(e.pricePerToken ?? 0),
          // mock data doesn't include volume; keep 0
          volume: 0,
        }))
        .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value) && p.timestamp > 0 && p.value > 0);
    }

    return (livePoints || [])
      .map((p) => ({
        timestamp: Number(p.timestamp ?? 0),
        value: Number(p.pricePerToken ?? 0),
        // volume in native units (BNB) so the histogram looks like the reference
        volume: Math.abs(bnbFromWeiSafe(p.nativeWei)),
      }))
      .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value) && p.timestamp > 0 && p.value > 0);
  }, [mockMode, mockEvents, livePoints]);

  // Render states
  if (mockMode && (!mockEvents || mockEvents.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No mock trades available.
      </div>
    );
  }

  if (!mockMode && liveLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Loading curve trades…
      </div>
    );
  }

  if (!mockMode && liveError) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-destructive p-4">
        {liveError}
      </div>
    );
  }

  if (chartPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No trades on the bonding curve yet.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* timeframe controls */}
      <div className="flex items-center justify-end gap-1 px-2 pb-2">
        {TIMEFRAMES.map((t) => {
          const active = t.key === tf;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTf(t.key)}
              className={[
                "px-2 py-1 text-[11px] rounded-md border transition",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background/50 text-muted-foreground border-border hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-[260px]">
        <CurveTradesChart points={chartPoints} intervalSec={bucketSec} />
      </div>
    </div>
  );
};

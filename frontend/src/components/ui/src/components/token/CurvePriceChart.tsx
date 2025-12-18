// src/components/token/CurvePriceChart.tsx
import { Card } from "@/components/ui/card";
import { useCurveTrades } from "@/hooks/useCurveTrades";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import type { MockCurveEvent } from "@/constants/mockCurveTrades";

type CurvePriceChartProps = {
  campaignAddress?: string;
  mockMode?: boolean;
  mockEvents?: MockCurveEvent[];
};

export const CurvePriceChart = ({
  campaignAddress,
  mockMode = false,
  mockEvents = [],
}: CurvePriceChartProps) => {
  //
  // 🔹 LIVE CHAIN DATA (only used when mockMode = false)
  //
  const {
    points: livePoints,
    loading: liveLoading,
    error: liveError,
  } = useCurveTrades(campaignAddress);

  //
  // 🔹 MERGE: Choose mock or live data
  //
  const isMock = mockMode;

  // The chart only needs timestamp + pricePerToken. Keep the shape identical for mock + live.
  const points: Array<{ timestamp: number; pricePerToken: number }> = isMock
    ? mockEvents.map((ev) => ({
        timestamp: ev.timestamp, // already unix seconds
        pricePerToken: ev.pricePerToken,
      }))
    : livePoints.map((p) => ({
        timestamp: p.timestamp,
        pricePerToken: p.pricePerToken,
      }));

  const loading = isMock ? false : liveLoading;
  const error = isMock ? null : liveError;

  //
  // 🔹 Render states
  //
  if (isMock && mockEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No mock trades available.
      </div>
    );
  }

  if (!isMock && !campaignAddress) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No campaign selected.
      </div>
    );
  }

  if (loading && points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Loading curve trades...
      </div>
    );
  }

  if (error && points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        {error}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        No trades on the bonding curve yet.
      </div>
    );
  }

  //
  // 🔹 Transform to chart data
  //
  const data = points.map((p) => ({
    time: new Date(p.timestamp * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    price: p.pricePerToken,
  }));

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(value: any) => [`${value}`, "Price (BNB/token)"]}
          />
          <Area type="monotone" dataKey="price" strokeWidth={1} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

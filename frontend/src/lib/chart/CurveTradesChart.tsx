import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  ColorType,
  CandlestickSeries,
  type IChartApi,
} from "lightweight-charts";

import { buildCandles, type ChartPoint } from "@/lib/chart/buildCandles";

type Props = {
  points: ChartPoint[];
  intervalSec: number;
  height?: number;
};

function formatCompact(n: number) {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (abs >= 1) return n.toFixed(2);
  return n.toPrecision(2);
}

export const CurveTradesChart: React.FC<Props> = ({ points, intervalSec, height }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  // re-render once per second so we extend to "now"
  const [nowTick, setNowTick] = useState(0);

  // fit only once per interval
  const fittedRef = useRef<{ intervalSec: number; fitted: boolean }>({ intervalSec, fitted: false });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const candles = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    return buildCandles(points ?? [], intervalSec, { extendToNow: true, nowSec });
  }, [points, intervalSec, nowTick]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // cleanup previous
    roRef.current?.disconnect();
    roRef.current = null;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    fittedRef.current = { intervalSec, fitted: false };

    const initW = Math.max(10, el.clientWidth || 10);
    const inferredH = el.clientHeight || 360;
    const initH = Math.max(200, height ?? inferredH);

    const chart = createChart(el, {
      width: initW,
      height: initH,

      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.72)",
      },

      // Only horizontal lines (price), no vertical time lines
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: true, color: "rgba(255,255,255,0.06)" },
      },

      crosshair: { mode: CrosshairMode.Normal },

      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: "rgba(255,255,255,0.18)",
        ticksVisible: true,
        textColor: "rgba(255,255,255,0.90)",
        entireTextOnly: true,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },

      timeScale: {
        borderVisible: true,
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: intervalSec <= 60,
        barSpacing: 4,
        minBarSpacing: 2.5,
        rightOffset: 6,
        lockVisibleTimeRangeOnResize: true,
      },

      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        minMove: 0.00000001,
        formatter: (p: number) => formatCompact(p),
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver(() => {
      const c = containerRef.current;
      if (!c) return;
      const w = Math.max(10, c.clientWidth || 10);
      const h2 = Math.max(200, height ?? (c.clientHeight || 360));
      chart.applyOptions({ width: w, height: h2 });
    });

    ro.observe(el);
    roRef.current = ro;

    return () => {
      ro.disconnect();
      roRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [height, intervalSec]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    series.setData(candles as any);

    // Fit only once per interval
    if (fittedRef.current.intervalSec !== intervalSec) {
      fittedRef.current = { intervalSec, fitted: false };
    }
    if (!fittedRef.current.fitted && candles.length > 10) {
      chartRef.current?.timeScale().fitContent();
      fittedRef.current.fitted = true;
    }
  }, [candles, intervalSec]);

  // ALWAYS RETURN JSX (even if points empty)
  return (
    <div style={{ width: "100%", height: height ? `${height}px` : "100%", position: "relative" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
};

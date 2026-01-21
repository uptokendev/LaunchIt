// frontend/src/lib/chart/CurveTradesChart.tsx
import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CrosshairMode,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
} from "lightweight-charts";

import { buildCandles, type ChartPoint } from "@/lib/chart/buildCandles";

type Props = {
  points: ChartPoint[];
  intervalSec: number; // 5, 60, 300, 900, 3600
  height?: number; // px; if omitted, fills container height
};

export function CurveTradesChart({ points, intervalSec, height }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const { candles, volumes } = useMemo(
    () => buildCandles(points ?? [], intervalSec),
    [points, intervalSec]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Cleanup previous
    roRef.current?.disconnect();
    roRef.current = null;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const rect = el.getBoundingClientRect();
    const initW = Math.max(10, rect.width || el.clientWidth || 10);

    // TS rule: don’t mix ?? and || without parentheses
    const inferredH = rect.height || el.clientHeight || 360;
    const initH = Math.max(200, (height ?? inferredH));

    const chart = createChart(el, {
      width: initW,
      height: initH,

      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.75)",
      },

      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },

      crosshair: { mode: CrosshairMode.Normal },

      rightPriceScale: {
  borderColor: "rgba(255,255,255,0.10)",
  // More bottom room so candles never visually overlap the volume band.
  // You can tune bottom between 0.30–0.40 depending on how tall you want volume.
  scaleMargins: { top: 0.10, bottom: 0.35 },
},

      timeScale: {
        borderColor: "rgba(255,255,255,0.10)",
        timeVisible: true,
        secondsVisible: intervalSec <= 60,
        rightOffset: 4,
      },

      // TradingView-like interaction
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
    });

    // v5+ API: addSeries(SeriesDefinition, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol", // dedicate a separate scale for volume
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Put volume at the bottom like TradingView
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0.02 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volSeries;

    // Responsive resize
    const ro = new ResizeObserver(() => {
      const c = containerRef.current;
      if (!c) return;

      const r = c.getBoundingClientRect();
      const w = Math.max(10, r.width || c.clientWidth || 10);

      const inferred = r.height || c.clientHeight || 360;
      const h = Math.max(200, (height ?? inferred));

      chart.applyOptions({ width: w, height: h });
    });

    ro.observe(el);
    roRef.current = ro;

    return () => {
      ro.disconnect();
      roRef.current = null;

      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, intervalSec]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current as any;
    const volSeries = volumeSeriesRef.current as any;
    if (!candleSeries || !volSeries) return;

    candleSeries.setData(candles as any);

    const vData = volumes.map((v, idx) => {
      const c = candles[idx];
      const isUp = c ? c.close >= c.open : true;
      return {
        time: v.time,
        value: v.value,
        color: isUp ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
      };
    });

    volSeries.setData(vData as any);

    chartRef.current?.timeScale().fitContent();
  }, [candles, volumes]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: height ? `${height}px` : "100%",
      }}
    />
  );
}

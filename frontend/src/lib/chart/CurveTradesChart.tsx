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
  intervalSec: number;
  height?: number;
};

export function CurveTradesChart({ points, intervalSec, height }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  // Fit only once per interval (prevents “stretching/big candles” on every update)
  const fittedRef = useRef<{ intervalSec: number; fitted: boolean }>({ intervalSec, fitted: false });

  const { candles, volumes } = useMemo(
    () => buildCandles(points ?? [], intervalSec),
    [points, intervalSec]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Cleanup previous instance
    roRef.current?.disconnect();
    roRef.current = null;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // reset fit flag on rebuild
    fittedRef.current = { intervalSec, fitted: false };

    const rect = el.getBoundingClientRect();
    const initW = Math.max(10, rect.width || el.clientWidth || 10);
    const inferredH = rect.height || el.clientHeight || 360;
    const initH = Math.max(200, height ?? inferredH);

    const chart = createChart(el, {
      width: initW,
      height: initH,

      // IMPORTANT: opaque chart background so your blur doesn’t show through
      layout: {
        background: { type: ColorType.Solid, color: "rgba(12,14,18,1)" },
        textColor: "rgba(255,255,255,0.72)",
      },

      // TradingView-like grid (both directions)
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },

      crosshair: { mode: CrosshairMode.Normal },

      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.14)",
        textColor: "rgba(255,255,255,0.78)",
        ticksVisible: true,
        entireTextOnly: true,
        // Reserve bottom area because volume sits there
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },

      timeScale: {
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: intervalSec <= 60,

        // Candle “density” like the reference chart
        barSpacing: 5,      // smaller than 8, not too tiny either
        minBarSpacing: 2.5, // prevents massive candles when zoomed in
        rightOffset: 8,
        lockVisibleTimeRangeOnResize: true,
      },

      // Interaction like TradingView
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
    });

    // Volume (reference image has it)
    const volSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      lastValueVisible: true,  // shows the volume label at right like TV
      priceLineVisible: false,
    });

    // Place volume at bottom (version-stable: apply on priceScale)
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0.02 },
      borderColor: "rgba(255,255,255,0.00)",
      textColor: "rgba(255,255,255,0.65)",
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
      const h = Math.max(200, height ?? inferred);

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
    const candleSeries = candleSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!candleSeries || !volSeries) return;

    candleSeries.setData(candles as any);

    // Volume coloring by candle direction (TradingView-like)
    const vData = volumes.map((v, idx) => {
      const c = candles[idx];
      const isUp = c ? c.close >= c.open : true;
      return {
        time: v.time,
        value: v.value,
        color: isUp ? "rgba(38,166,154,0.55)" : "rgba(239,83,80,0.55)",
      };
    });
    volSeries.setData(vData as any);

    // Fit only once per timeframe, not on every realtime tick
    if (fittedRef.current.intervalSec !== intervalSec) {
      fittedRef.current = { intervalSec, fitted: false };
    }
    if (!fittedRef.current.fitted && candles.length > 5) {
      chartRef.current?.timeScale().fitContent();
      fittedRef.current.fitted = true;
    }
  }, [candles, volumes, intervalSec]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: height ? `${height}px` : "100%",
        borderRadius: 12,
        overflow: "hidden", // makes it look like the reference panel
      }}
    />
  );
}

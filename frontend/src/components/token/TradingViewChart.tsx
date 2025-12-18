import { useEffect, useMemo, useRef, useState } from "react";

import {
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type TvTrade = {
  /** Unix timestamp in seconds */
  timestamp: number;
  /** Price (e.g., BNB per token) */
  price: number;
  /** Volume (e.g., BNB amount) */
  volume: number;
  /** Optional: used to color volume bars */
  side?: "buy" | "sell";
};

type Candle = {
  time: UTCTimestamp; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
};

type VolumeBar = {
  time: UTCTimestamp;
  value: number;
  color?: string;
};

function cssHsl(varName: string, fallback = "0 0% 100%") {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName);
  const clean = (v || "").trim();
  return `hsl(${clean || fallback})`;
}


function inferPriceFormat(prices: number[]): { precision: number; minMove: number } {
  const vals = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (!vals.length) return { precision: 6, minMove: 1e-6 };

  // Use a robust "typical" price (median) to pick decimals for the price scale.
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];

  // If prices are very small (common for BNB-per-token), default 2 decimals
  // will render everything as 0.00. Increase precision accordingly.
  let precision: number;
  if (mid >= 100) precision = 2;
  else if (mid >= 1) precision = 4;
  else if (mid >= 0.01) precision = 6;
  else {
    const exp = Math.ceil(absLog10(mid));
    precision = Math.min(12, Math.max(6, exp + 2));
  }

  const minMove = Math.pow(10, -precision);
  return { precision, minMove };
}

function absLog10(x: number): number {
  if (x <= 0) return 0;
  return Math.abs(Math.log10(x));
}

function bucketSec(ts: number, intervalSec: number): UTCTimestamp {
  const t = Math.floor(ts);
  const b = Math.floor(t / intervalSec) * intervalSec;
  return b as UTCTimestamp;
}

function toCandlesAndVolume(trades: TvTrade[], intervalSec: number): { candles: Candle[]; volumes: VolumeBar[] } {
  if (!trades?.length) return { candles: [], volumes: [] };

  const sorted = [...trades]
    .filter((t) => Number.isFinite(t?.timestamp) && Number.isFinite(t?.price) && Number.isFinite(t?.volume))
    .sort((a, b) => a.timestamp - b.timestamp);

  const candleBuckets = new Map<number, Candle>();
  const volBuckets = new Map<number, VolumeBar>();

  // Theme-ish volume colors (fallbacks)
  const buyCol = cssHsl("--primary", "142 71% 45%");
  const sellCol = cssHsl("--destructive", "0 84% 60%");
  const neutral = cssHsl("--muted-foreground", "240 5% 64%");

  for (const tr of sorted) {
    const t = bucketSec(tr.timestamp, intervalSec);
    const key = Number(t);

    const c = candleBuckets.get(key);
    if (!c) {
      candleBuckets.set(key, {
        time: t,
        open: tr.price,
        high: tr.price,
        low: tr.price,
        close: tr.price,
      });
    } else {
      c.high = Math.max(c.high, tr.price);
      c.low = Math.min(c.low, tr.price);
      c.close = tr.price;
    }

    const v = volBuckets.get(key);
    const barColor = tr.side === "buy" ? buyCol : tr.side === "sell" ? sellCol : neutral;
    if (!v) {
      volBuckets.set(key, {
        time: t,
        value: tr.volume,
        color: barColor,
      });
    } else {
      v.value += tr.volume;
      // keep existing color
    }
  }

  return {
    candles: Array.from(candleBuckets.values()).sort((a, b) => a.time - b.time),
    volumes: Array.from(volBuckets.values()).sort((a, b) => a.time - b.time),
  };
}

function applyTradeToLastBars(
  trade: TvTrade,
  intervalSec: number,
  lastCandle: Candle | null,
  lastVol: VolumeBar | null,
  colors: { buy: string; sell: string; neutral: string }
): { candle: Candle; vol: VolumeBar } {
  const t = bucketSec(trade.timestamp, intervalSec);
  const isNewBucket = !lastCandle || lastCandle.time !== t;

  const candle: Candle = isNewBucket
    ? { time: t, open: trade.price, high: trade.price, low: trade.price, close: trade.price }
    : {
        ...lastCandle,
        high: Math.max(lastCandle.high, trade.price),
        low: Math.min(lastCandle.low, trade.price),
        close: trade.price,
      };

  const color = trade.side === "buy" ? colors.buy : trade.side === "sell" ? colors.sell : colors.neutral;
  const vol: VolumeBar = isNewBucket
    ? { time: t, value: trade.volume, color }
    : { ...lastVol!, time: t, value: (lastVol?.value ?? 0) + trade.volume, color: lastVol?.color ?? color };

  return { candle, vol };
}

export function TradingViewChart({
  trades,
  className,
  emptyLabel = "No data.",
  candleIntervalSec,
  autoScroll = true,
}: {
  trades: TvTrade[] | undefined;
  className?: string;
  emptyLabel?: string;
  /** Optional. Defaults to 60 seconds (1m). */
  candleIntervalSec?: number;
  /** Auto-scroll to the latest bar as new trades arrive. */
  autoScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const lastVolRef = useRef<VolumeBar | null>(null);
  const prevLenRef = useRef<number>(0);

  const [ready, setReady] = useState(false);

  const interval = useMemo(() => Math.max(15, candleIntervalSec ?? 60), [candleIntervalSec]);

  const { candles, volumes } = useMemo(() => {
    return toCandlesAndVolume(trades ?? [], interval);
  }, [trades, interval]);

  const priceFormat = useMemo(() => {
    return inferPriceFormat((trades ?? []).map((t) => t.price));
  }, [trades]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Theme colors from Tailwind CSS variables in your app
    const text = cssHsl("--foreground", "0 0% 98%");
    const bg = cssHsl("--background", "240 10% 3.9%");
    const grid = cssHsl("--border", "240 3.7% 15.9%");
    const accent = cssHsl("--primary", "142 71% 45%");
    const down = cssHsl("--destructive", "0 84% 60%");
    const muted = cssHsl("--muted-foreground", "240 5% 64%");

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      },
      grid: {
        // Subtle grid lines (TV-ish); your theme border color is already low-contrast.
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: grid,
        ticksVisible: true,
        entireTextOnly: true,
        scaleMargins: { top: 0.08, bottom: 0.28 }, // reserve bottom for volume
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderVisible: true,
        borderColor: grid,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        rightOffset: 4,
      },
      crosshair: {
        vertLine: { color: grid, labelBackgroundColor: bg },
        horzLine: { color: grid, labelBackgroundColor: bg },
      },
      handleScale: { axisPressedMouseMove: false },
      handleScroll: { pressedMouseMove: true, mouseWheel: true, horzTouchDrag: true, vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: accent,
      downColor: down,
      borderUpColor: accent,
      borderDownColor: down,
      wickUpColor: accent,
      wickDownColor: down,
      wickVisible: true,
      borderVisible: true,
      priceFormat: { type: "price", precision: 8, minMove: 1e-8 },
      priceLineVisible: true,
      lastValueVisible: true,
    });

    // Volume (histogram) in the bottom area
const volumeSeries = chart.addSeries(HistogramSeries, {
  priceScaleId: "volume", // dedicated scale for volume
  priceFormat: { type: "volume" },
  lastValueVisible: false,
});
// Configure that volume price scale to occupy the bottom portion
chart.priceScale("volume").applyOptions({
  scaleMargins: { top: 0.78, bottom: 0.0 },
  visible: false,        // hide the scale (we only want bars)
  borderVisible: false,
});


    // Give a muted baseline color; per-bar color is provided in data.
    volumeSeries.applyOptions({
      color: muted,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    setReady(true);

    const ro = new ResizeObserver(() => {
      // Keep it tight within your container. Fit once on resize.
      chart.timeScale().fitContent();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lastCandleRef.current = null;
      lastVolRef.current = null;
      prevLenRef.current = 0;
      setReady(false);
    };
  }, []);

  // Initial setData (and rebuild when interval changes)
  useEffect(() => {
    if (!ready) return;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    candleSeries.setData(candles as any);
    volumeSeries.setData(volumes as any);

    lastCandleRef.current = candles.length ? candles[candles.length - 1] : null;
    lastVolRef.current = volumes.length ? volumes[volumes.length - 1] : null;
    prevLenRef.current = (trades ?? []).length;

    chart.timeScale().fitContent();
  }, [ready, candles, volumes, interval]);

  // Keep the price scale readable for very small prices.
  useEffect(() => {
    if (!ready) return;
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    candleSeries.applyOptions({
      priceFormat: {
        type: "price",
        precision: priceFormat.precision,
        minMove: priceFormat.minMove,
      },
    });
  }, [ready, priceFormat]);

  // Realtime updates: if trades array grows, only update the new portion.
  useEffect(() => {
    if (!ready) return;
    const t = trades ?? [];
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    const prevLen = prevLenRef.current;
    if (t.length <= prevLen) {
      prevLenRef.current = t.length;
      return;
    }

    // If we have no baseline yet, just let the setData effect handle it.
    if (!lastCandleRef.current || !lastVolRef.current) {
      prevLenRef.current = t.length;
      return;
    }

    const buyCol = cssHsl("--primary", "142 71% 45%");
    const sellCol = cssHsl("--destructive", "0 84% 60%");
    const neutral = cssHsl("--muted-foreground", "240 5% 64%");

    const newTrades = t.slice(prevLen);
    for (const tr of newTrades) {
      if (!Number.isFinite(tr.timestamp) || !Number.isFinite(tr.price) || !Number.isFinite(tr.volume)) continue;
      const { candle, vol } = applyTradeToLastBars(tr, interval, lastCandleRef.current, lastVolRef.current, {
        buy: buyCol,
        sell: sellCol,
        neutral,
      });

      candleSeries.update(candle as any);
      volumeSeries.update(vol as any);
      lastCandleRef.current = candle;
      lastVolRef.current = vol;
    }

    prevLenRef.current = t.length;

    if (autoScroll) {
      chart.timeScale().scrollToRealTime();
    }
  }, [ready, trades, interval, autoScroll]);

  const isEmpty = candles.length < 2;

  return (
    <div className={`relative h-full w-full ${className ?? ""}`.trim()}>
      <div ref={containerRef} className="absolute inset-0" />

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-muted-foreground">{emptyLabel}</div>
        </div>
      )}

      {/* Lightweight Charts attribution (required by its license). */}
      <a
        href="https://www.tradingview.com"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/80 hover:text-muted-foreground"
      >
        Charts by TradingView
      </a>
    </div>
  );
}

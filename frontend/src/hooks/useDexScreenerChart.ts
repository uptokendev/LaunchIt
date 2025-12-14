import { useEffect, useState } from "react";
import { USE_MOCK_DATA } from "@/config/mockConfig";

// Mock demo pair
const MOCK_BASE_URL =
  "https://dexscreener.com/bsc/0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e";

// "Chart only" query params
const CHART_QUERY =
  "embed=1&theme=dark&chartTheme=dark&tabs=0&trades=0&info=0&interval=15";

const buildChartOnlyUrl = (base: string) =>
  base.includes("?") ? `${base}&${CHART_QUERY}` : `${base}?${CHART_QUERY}`;

type DexChartState = {
  url?: string;
  loading: boolean;
  error?: string;
};

export function useDexScreenerChart(tokenAddress?: string): DexChartState {
  const [url, setUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setUrl(undefined);
    setError(undefined);

    if (!tokenAddress) return;

    // MOCK MODE – always show the same demo pair
    if (USE_MOCK_DATA) {
      setUrl(buildChartOnlyUrl(MOCK_BASE_URL));
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
        );

        if (!res.ok) {
          throw new Error(`DexScreener HTTP ${res.status}`);
        }

        const data = await res.json();
        const pairs: any[] = data.pairs ?? [];

        if (!pairs.length) {
          if (!cancelled) setUrl(undefined);
          return;
        }

        // Prefer BSC + Pancake pair; fallback to first
        const bestPair =
          pairs.find(
            (p) =>
              p.chainId?.toLowerCase() === "bsc" &&
              p.dexId?.toLowerCase().includes("pancake")
          ) ?? pairs[0];

        if (!bestPair) {
          if (!cancelled) setUrl(undefined);
          return;
        }

        const chain = bestPair.chainId;
        const pairAddress = bestPair.pairAddress;
        const base = `https://dexscreener.com/${chain}/${pairAddress}`;

        if (!cancelled) {
          setUrl(buildChartOnlyUrl(base));
        }
      } catch (e: any) {
        console.error("DexScreener fetch failed", e);
        if (!cancelled) {
          setError(e?.message || "Failed to load chart");
          setUrl(undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  return { url, loading, error };
}

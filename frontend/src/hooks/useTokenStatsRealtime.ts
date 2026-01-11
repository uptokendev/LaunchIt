import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";
import { getActiveChainId, type SupportedChainId } from "@/lib/chainConfig";

const API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");
const ABLY_KEY_NAME = String(import.meta.env.VITE_ABLY_CLIENT_KEY || "").trim();

export type TokenStatsRealtime = {
  lastPriceBnb: number | null;
  marketcapBnb: number | null;
  vol24hBnb: number;
  soldTokens: number | null;
  updatedAt?: string;
};

async function fetchJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { method: "GET", signal });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function useTokenStatsRealtime(campaignAddress?: string, chainId?: number, enabled = true) {
  const [stats, setStats] = useState<TokenStatsRealtime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cid = useMemo<SupportedChainId>(() => getActiveChainId(Number(chainId ?? 97)), [chainId]);

  const url = useMemo(() => {
    if (!API_BASE || !campaignAddress) return "";
    return `${API_BASE}/api/token/${campaignAddress.toLowerCase()}/summary?chainId=${cid}`;
  }, [campaignAddress, cid]);

  const pull = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !campaignAddress) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!url) {
      setError("Missing VITE_REALTIME_API_BASE");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const row = await fetchJson(url, signal);
      if (!row) {
        setStats(null);
        setError(null);
        return;
      }
      setStats({
        lastPriceBnb: num(row.last_price_bnb),
        marketcapBnb: num(row.marketcap_bnb),
        vol24hBnb: Number(num(row.vol_24h_bnb) ?? 0),
        soldTokens: num(row.sold_tokens),
        updatedAt: String(row.updated_at ?? ""),
      });
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load token stats"));
    } finally {
      setLoading(false);
    }
  }, [enabled, campaignAddress, url]);

  // Initial + reconcile polling (lightweight)
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    pull(ac.signal);
    if (!enabled || !campaignAddress) return () => ac.abort();
    const t = setInterval(() => pull(ac.signal), 15_000);
    return () => {
      clearInterval(t);
      ac.abort();
    };
  }, [enabled, campaignAddress, cid, pull]);

  // Ably live patches
  const ablyRef = useRef<Ably.Realtime | null>(null);
  useEffect(() => {
    if (!enabled || !campaignAddress) return;
    if (!API_BASE) return;
    if (!ABLY_KEY_NAME) return;

    const authUrl = `${API_BASE}/api/ably/token?chainId=${cid}&campaign=${campaignAddress.toLowerCase()}`;
    const ably = new Ably.Realtime({ key: ABLY_KEY_NAME, authUrl, authMethod: "GET" });
    ablyRef.current = ably;

    const chName = `token:${cid}:${campaignAddress.toLowerCase()}`;
    const ch = ably.channels.get(chName);

    const onStats = (msg: Ably.Types.Message) => {
      const data: any = msg.data;
      if (!data) return;
      if ((msg.name || "") !== "stats_patch" && String(data.type || "") !== "stats_patch") return;

      setStats((prev) => {
        const next: TokenStatsRealtime = {
          lastPriceBnb: num(data.lastPriceBnb) ?? prev?.lastPriceBnb ?? null,
          marketcapBnb: num(data.marketcapBnb) ?? prev?.marketcapBnb ?? null,
          vol24hBnb: Number(num(data.vol24hBnb) ?? prev?.vol24hBnb ?? 0),
          soldTokens: prev?.soldTokens ?? null,
          updatedAt: prev?.updatedAt,
        };
        return next;
      });
    };

    const onConnected = (c: Ably.Types.ConnectionStateChange) => {
      if (c.current === "connected") pull();
    };

    ably.connection.on(onConnected);
    ch.subscribe("stats_patch", onStats);

    return () => {
      try { ch.unsubscribe("stats_patch", onStats); } catch {}
      try { ably.connection.off(onConnected); } catch {}
      try { ably.close(); } catch {}
      ablyRef.current = null;
    };
  }, [enabled, campaignAddress, cid, pull]);

  return { stats, loading, error };
}

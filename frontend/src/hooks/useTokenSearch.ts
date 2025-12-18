import { useEffect, useMemo, useRef, useState } from "react";
import type { CampaignInfo } from "@/lib/launchpadClient";
import type { TokenSearchResult } from "@/types/search";
import { searchTokensRemote } from "@/lib/searchClient";

function normalize(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

function scoreCampaign(query: string, c: CampaignInfo): number {
  const q = normalize(query);
  const sym = normalize(c.symbol ?? "");
  const name = normalize(c.name ?? "");
  const addr = normalize(c.campaign ?? "");
  if (!q) return 0;

  // Exact matches first
  if (sym === q) return 1000;
  if (name === q) return 900;

  // Prefix matches
  if (sym.startsWith(q)) return 800;
  if (name.startsWith(q)) return 700;

  // Substring matches
  if (sym.includes(q)) return 600;
  if (name.includes(q)) return 500;
  if (addr.includes(q)) return 400;

  return 0;
}

function localSearch(query: string, campaigns: CampaignInfo[], limit: number): TokenSearchResult[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const ranked = (campaigns ?? [])
    .filter((c) => !!c && typeof c.symbol === "string" && typeof c.name === "string")
    .map((c) => ({ c, score: scoreCampaign(q, c) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => ({
      campaignAddress: String(c.campaign ?? "").toLowerCase(),
      tokenAddress: (c as any)?.token ? String((c as any).token).toLowerCase() : undefined,
      name: c.name,
      symbol: c.symbol,
      status: "unknown" as const,
      logoURI: (c as any).logoURI ? String((c as any).logoURI) : undefined,
    }))
    .filter((r) => /^0x[a-f0-9]{40}$/.test(r.campaignAddress));

  return ranked;
}

export function useTokenSearch(
  query: string,
  campaigns?: CampaignInfo[],
  opts?: { limit?: number; debounceMs?: number }
) {
  const limit = opts?.limit ?? 10;
  const debounceMs = opts?.debounceMs ?? 250;

  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const localResults = useMemo(() => {
    return campaigns ? localSearch(query, campaigns, limit) : [];
  }, [campaigns, query, limit]);

  useEffect(() => {
    const q = (query ?? "").trim();
    setError(null);

    // For short queries, just show local results (likely empty)
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Always show local results immediately (fast UI)
    setResults(localResults);

    // Remote search is optional; only attempt if env var is present.
    const apiBase = String((import.meta as any).env?.VITE_SEARCH_API_URL ?? "").trim();
    if (!apiBase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const t = window.setTimeout(async () => {
      try {
        const remote = await searchTokensRemote(q, { limit, signal: controller.signal });
        // Merge: prefer remote, but fall back to local if remote returns empty
        setResults(remote.length ? remote : localResults);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError("Search failed");
        setResults(localResults);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query, limit, debounceMs, localResults]);

  return { results, loading, error };
}

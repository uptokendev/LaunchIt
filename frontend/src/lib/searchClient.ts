import type { TokenSearchResult } from "@/types/search";

const rawBase = String(import.meta.env.VITE_SEARCH_API_URL ?? "").trim();
const API_BASE = rawBase.replace(/\/$/, "");

function buildSearchUrl(q: string, limit: number): string {
  // Absolute base URL: VITE_SEARCH_API_URL=https://api.example.com
  if (API_BASE && /^https?:\/\//i.test(API_BASE)) {
    const u = new URL(`${API_BASE}/search`);
    u.searchParams.set("q", q);
    u.searchParams.set("limit", String(limit));
    return u.toString();
  }

  // Relative (dev) fallback: /api/search
  const url = new URL(`/api/search`, window.location.origin);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

/**
 * Remote search (optional).
 * - If VITE_SEARCH_API_URL is not set, the caller should not rely on this.
 * - Supports either response shape: { results: [...] } or [...]
 */
export async function searchTokensRemote(
  q: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<TokenSearchResult[]> {
  const query = (q ?? "").trim();
  if (query.length < 2) return [];

  // If no base is configured, treat as disabled.
  if (!API_BASE) return [];

  const limit = opts?.limit ?? 10;
  try {
    const res = await fetch(buildSearchUrl(query, limit), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: opts?.signal,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as any;
    const results: any[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

    return results
      .filter(Boolean)
      .map((r) => ({
        campaignAddress: String(r.campaignAddress ?? r.campaign ?? "").toLowerCase(),
        tokenAddress: r.tokenAddress ? String(r.tokenAddress).toLowerCase() : undefined,
        name: String(r.name ?? ""),
        symbol: String(r.symbol ?? ""),
        status: (r.status ?? "unknown") as TokenSearchResult["status"],
        logoURI: r.logoURI ? String(r.logoURI) : undefined,
      }))
      .filter((r) => /^0x[a-f0-9]{40}$/.test(r.campaignAddress) && r.symbol.length > 0);
  } catch (e: any) {
    if (e?.name === "AbortError") return [];
    return [];
  }
}

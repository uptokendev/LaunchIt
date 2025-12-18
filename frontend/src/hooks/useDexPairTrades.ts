// src/hooks/useDexPairTrades.ts
// On-chain "DEX" price feed for graduated tokens using Pancake pair reserves.
//
// Phase 1 constraints:
//  - No indexer/subgraph.
//  - Avoid large eth_getLogs ranges on public RPCs.
//
// Approach:
//  1) Query recent Sync logs from the pair (bounded + chunked)
//  2) Convert each Sync into a spot price point using reserves
//  3) Subscribe to live Sync events for realtime updates
//
// Notes:
//  - The derived price is the reserve ratio (mid price), not the exact swap execution price.
//  - If the pair is not against WBNB, we still return a ratio in terms of the other asset.

import { useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";

export type DexPairPricePoint = {
  timestamp: number; // unix seconds
  pricePerToken: number; // quote per token (BNB/token when quote is WBNB)
};

type UseDexPairTradesState = {
  points: DexPairPricePoint[];
  loading: boolean;
  error?: string;
};

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
] as const;

const DEFAULT_LOOKBACK_BLOCKS = 50_000;
const LOG_CHUNK_SIZE = 900;

async function queryFilterChunked(
  contract: Contract,
  filter: any,
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);
    const chunk = await contract.queryFilter(filter, start, end);
    logs.push(...chunk);
  }
  return logs;
}

function toLower(a?: string) {
  return (a ?? "").toLowerCase();
}

export function useDexPairTrades(opts: {
  tokenAddress?: string;
  pairAddress?: string;
}): UseDexPairTradesState {
  const { provider } = useWallet();
  const [points, setPoints] = useState<DexPairPricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!provider || !opts.pairAddress || !opts.tokenAddress) {
      setPoints([]);
      return;
    }

    const pair = new Contract(opts.pairAddress, PAIR_ABI, provider);
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - DEFAULT_LOOKBACK_BLOCKS);

        const [token0, token1] = await Promise.all([
          pair.token0(),
          pair.token1(),
        ]);

        const tokenAddr = toLower(opts.tokenAddress);
        const token0L = toLower(token0);
        const token1L = toLower(token1);

        // Determine which side is our token and which side is the quote.
        const tokenIs0 = tokenAddr === token0L;
        const tokenIs1 = tokenAddr === token1L;
        if (!tokenIs0 && !tokenIs1) {
          throw new Error("Token is not part of the detected pair");
        }

        const syncFilter = pair.filters.Sync?.();
        const syncLogs = syncFilter
          ? await queryFilterChunked(pair, syncFilter, fromBlock, latestBlock)
          : [];

        // Cache timestamps per block.
        const blockTs = new Map<number, number>();

        const next: DexPairPricePoint[] = [];

        for (const log of syncLogs) {
          let ts = blockTs.get(log.blockNumber);
          if (!ts) {
            const block = await provider.getBlock(log.blockNumber);
            ts = block?.timestamp ?? Math.floor(Date.now() / 1000);
            blockTs.set(log.blockNumber, ts);
          }

          const reserve0: bigint = log.args?.reserve0 ?? log.args?.[0] ?? 0n;
          const reserve1: bigint = log.args?.reserve1 ?? log.args?.[1] ?? 0n;

          const tokenRes = tokenIs0 ? reserve0 : reserve1;
          const quoteRes = tokenIs0 ? reserve1 : reserve0;

          if (tokenRes === 0n) continue;

          // We do not know decimals for reserves without ERC20 queries;
          // however for BNB/WBNB pairs reserve units are 18 and the
          // relative ratio is still meaningful.
          const tokenResF = Number(ethers.formatUnits(tokenRes, 18));
          const quoteResF = Number(ethers.formatUnits(quoteRes, 18));
          const price = tokenResF > 0 ? quoteResF / tokenResF : 0;

          if (!Number.isFinite(price) || price <= 0) continue;

          next.push({ timestamp: ts, pricePerToken: price });
        }

        // Also add a "current" point based on latest reserves (helps when there are no logs).
        try {
          const r = await pair.getReserves();
          const reserve0: bigint = r?.reserve0 ?? r?.[0] ?? 0n;
          const reserve1: bigint = r?.reserve1 ?? r?.[1] ?? 0n;

          const tokenRes = tokenIs0 ? reserve0 : reserve1;
          const quoteRes = tokenIs0 ? reserve1 : reserve0;

          if (tokenRes > 0n) {
            const tokenResF = Number(ethers.formatUnits(tokenRes, 18));
            const quoteResF = Number(ethers.formatUnits(quoteRes, 18));
            const price = tokenResF > 0 ? quoteResF / tokenResF : 0;
            if (Number.isFinite(price) && price > 0) {
              const block = await provider.getBlock("latest");
              next.push({
                timestamp: block?.timestamp ?? Math.floor(Date.now() / 1000),
                pricePerToken: price,
              });
            }
          }
        } catch {
          // ignore
        }

        next.sort((a, b) => a.timestamp - b.timestamp);

        if (!cancelled) setPoints(next);

        // Subscribe for realtime updates
        const onSync = async (reserve0: bigint, reserve1: bigint) => {
          try {
            const tokenRes = tokenIs0 ? reserve0 : reserve1;
            const quoteRes = tokenIs0 ? reserve1 : reserve0;
            if (tokenRes === 0n) return;

            const tokenResF = Number(ethers.formatUnits(tokenRes, 18));
            const quoteResF = Number(ethers.formatUnits(quoteRes, 18));
            const price = tokenResF > 0 ? quoteResF / tokenResF : 0;
            if (!Number.isFinite(price) || price <= 0) return;

            const block = await provider.getBlock("latest");
            const ts = block?.timestamp ?? Math.floor(Date.now() / 1000);

            setPoints((prev) => {
              const out = [...prev, { timestamp: ts, pricePerToken: price }];
              // Keep it bounded
              return out.slice(-4000);
            });
          } catch {
            // ignore
          }
        };

        if (pair.on && pair.off) {
          // ts-expect-error ethers typing is permissive for event listeners
          pair.on("Sync", onSync);
        }

        return () => {
          if (pair.off) {
            // ts-expect-error ethers typing is permissive for event listeners
            pair.off("Sync", onSync);
          }
        };
      } catch (e: any) {
        console.error("Failed to load pair trades", e);
        if (!cancelled) {
          setError(e?.message || "Failed to load DEX trades");
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    let cleanup: undefined | (() => void);
    load().then((fn) => {
      cleanup = fn as any;
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [provider, opts.pairAddress, opts.tokenAddress]);

  return { points, loading, error };
}

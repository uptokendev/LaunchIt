import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import type { Transaction } from "@/types/token";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import { getReadProvider } from "@/lib/readProvider";

// Public RPCs (and MetaMask) often rate-limit eth_getLogs, especially when requests are batched.
// We:
//  - prefer a configured RPC for reads (VITE_BSC_TESTNET_RPC / VITE_BSC_MAINNET_RPC)
//  - disable ethers batching (batchMaxCount: 1) via getReadProvider()
//  - chunk getLogs ranges to avoid provider max-range errors
//  - use a per-campaign startBlock (deployment block) so we never "miss" older trades on testnet
//  - incrementally reconcile from the last scanned block with a small overlap

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_TARGET_CHAIN_ID ?? "97");

const toAbi = (x: any) => (x?.abi ?? x) as ethers.InterfaceAbi;
const CAMPAIGN_ABI = toAbi(LaunchCampaignArtifact);

type CurveTrade = Transaction & {
  // internal fields used by TokenDetails UI
  from: string;
  to: string;
  tokensWei: bigint;
  nativeWei: bigint;
  pricePerToken: number;
  timestamp: number;
  txHash: string;
  blockNumber: number;
  logIndex?: number;
};

function lsKeyDeploy(chainId: number, addr: string) {
  return `launchit:campaignDeployBlock:${chainId}:${addr.toLowerCase()}`;
}
function lsKeyCursor(chainId: number, addr: string) {
  return `launchit:curveTradesCursor:${chainId}:${addr.toLowerCase()}`;
}

function safeParseInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function findContractDeployBlock(provider: ethers.Provider, address: string, latest: number): Promise<number> {
  // Binary-search for first block where getCode(address) != "0x"
  let lo = 0;
  let hi = latest;
  let found = latest;

  // Fast-path: if no code at latest, it's not a contract (or wrong chain)
  const codeLatest = await provider.getCode(address, latest);
  if (!codeLatest || codeLatest === "0x") return Math.max(0, latest - 12_000);

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    const hasCode = !!code && code !== "0x";
    if (hasCode) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return Math.max(0, found - 5); // small margin
}

const LOG_CHUNK_SIZE = 500;

async function getLogsChunked(
  provider: any,
  params: { address: string; topics?: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);

    // Basic retry for flaky public endpoints
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const chunk = await provider.getLogs({ ...params, fromBlock: start, toBlock: end });
        logs.push(...chunk);
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        // small backoff
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    if (lastErr) throw lastErr;
  }
  return logs;
}

function mergeTrades(prev: CurveTrade[], next: CurveTrade[]) {
  const map = new Map<string, CurveTrade>();
  const keyOf = (t: any) => `${String(t.txHash ?? t.tx)}:${Number(t.logIndex ?? 0)}`;
  for (const t of prev) map.set(keyOf(t), t);
  for (const t of next) map.set(keyOf(t), t);
  return Array.from(map.values()).sort((a, b) => {
    const bnA = Number((a as any).blockNumber ?? 0);
    const bnB = Number((b as any).blockNumber ?? 0);
    if (bnA !== bnB) return bnA - bnB;
    const liA = Number((a as any).logIndex ?? 0);
    const liB = Number((b as any).logIndex ?? 0);
    return liA - liB;
  });
}

/**
 * Fetches curve trades (TokensPurchased / TokensSold) for a campaign and exposes
 * them as enriched trade points for the TokenDetails UI and chart.
 */
export function useCurveTrades(campaignAddress?: string) {
  const { chainId } = useWallet() as any;

  const readProvider = useMemo(() => {
    const cid = Number(chainId ?? TARGET_CHAIN_ID);
    return getReadProvider(cid);
  }, [chainId]);

  const [points, setPoints] = useState<CurveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const deployBlockRef = useRef<number | null>(null);
  const cursorRef = useRef<number | null>(null);

  // Reset cursors on campaign change
  useEffect(() => {
    deployBlockRef.current = null;
    cursorRef.current = null;
    setPoints([]);
    setLoading(true);
    setError(null);
  }, [campaignAddress, chainId]);

  const fetchTrades = useCallback(async () => {
    if (!campaignAddress) {
      setPoints([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!readProvider) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const latest = await readProvider.getBlockNumber();
      const cid = Number(chainId ?? TARGET_CHAIN_ID);

      // Resolve deployment/start block once and cache it (prevents missing older trades on testnet).
      if (deployBlockRef.current == null) {
        const k = lsKeyDeploy(cid, campaignAddress);
        const cached = safeParseInt(localStorage.getItem(k));
        if (cached != null && cached >= 0 && cached <= latest) {
          deployBlockRef.current = cached;
        } else {
          const found = await findContractDeployBlock(readProvider, campaignAddress, latest);
          deployBlockRef.current = found;
          try {
            localStorage.setItem(k, String(found));
          } catch {
            // ignore
          }
        }
      }

      // Cursor: after first full load, only scan recent blocks with overlap, then merge results.
      if (cursorRef.current == null) {
        const ck = lsKeyCursor(cid, campaignAddress);
        const cachedCursor = safeParseInt(localStorage.getItem(ck));
        if (cachedCursor != null && cachedCursor > 0 && cachedCursor <= latest) {
          cursorRef.current = cachedCursor;
        }
      }

      const startBlock = deployBlockRef.current ?? Math.max(0, latest - 12_000);
      const overlap = 10;
      const fromBlock = cursorRef.current == null ? startBlock : Math.max(startBlock, cursorRef.current - overlap);
      const toBlock = latest;

      const iface = new ethers.Interface(CAMPAIGN_ABI);
      const buyTopic = iface.getEvent("TokensPurchased").topicHash;
      const sellTopic = iface.getEvent("TokensSold").topicHash;

      const [buyLogs, sellLogs] = await Promise.all([
        getLogsChunked(readProvider, { address: campaignAddress, topics: [buyTopic] }, fromBlock, toBlock),
        getLogsChunked(readProvider, { address: campaignAddress, topics: [sellTopic] }, fromBlock, toBlock),
      ]);

      const parsedBuys: CurveTrade[] = buyLogs
        .map((log) => {
          try {
            const parsed = iface.parseLog(log);
            const buyer = String(parsed.args.buyer).toLowerCase();
            const tokensWei = parsed.args.amountOut as bigint;
            const nativeWei = parsed.args.cost as bigint;

            const tokens = Number(ethers.formatUnits(tokensWei, 18));
            const native = Number(ethers.formatEther(nativeWei));
            const pricePerToken = native / Math.max(1e-18, tokens);

            return {
              type: "buy" as any,
              from: buyer,
              to: campaignAddress.toLowerCase(),
              tokensWei,
              nativeWei,
              pricePerToken,
              timestamp: 0,
              txHash: String(log.transactionHash),
              blockNumber: Number(log.blockNumber),
              logIndex: Number((log as any).index ?? (log as any).logIndex ?? 0),
            } as any;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as CurveTrade[];

      const parsedSells: CurveTrade[] = sellLogs
        .map((log) => {
          try {
            const parsed = iface.parseLog(log);
            const seller = String(parsed.args.seller).toLowerCase();
            const tokensWei = parsed.args.amountIn as bigint;
            const nativeWei = parsed.args.payout as bigint;

            const tokens = Number(ethers.formatUnits(tokensWei, 18));
            const native = Number(ethers.formatEther(nativeWei));
            const pricePerToken = native / Math.max(1e-18, tokens);

            return {
              type: "sell" as any,
              from: seller,
              to: campaignAddress.toLowerCase(),
              tokensWei,
              nativeWei,
              pricePerToken,
              timestamp: 0,
              txHash: String(log.transactionHash),
              blockNumber: Number(log.blockNumber),
              logIndex: Number((log as any).index ?? (log as any).logIndex ?? 0),
            } as any;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as CurveTrade[];

      const combined = [...parsedBuys, ...parsedSells].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
      });

      // fetch timestamps for unique blocks only
      const uniqueBlocks = Array.from(new Set(combined.map((t) => t.blockNumber).filter((n) => Number.isFinite(n))));
      const blockTs = new Map<number, number>();

      for (const bn of uniqueBlocks) {
        try {
          const b = await readProvider.getBlock(bn);
          if (b?.timestamp) blockTs.set(bn, Number(b.timestamp));
        } catch {
          // ignore
        }
      }

      const newPoints = combined.map((t) => ({
        ...t,
        timestamp: blockTs.get(t.blockNumber) ?? 0,
      }));

      setPoints((prev) => mergeTrades(prev, newPoints));
      setLoading(false);
      setError(null);

      cursorRef.current = latest;
      try {
        localStorage.setItem(lsKeyCursor(cid, campaignAddress), String(latest));
      } catch {
        // ignore
      }
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Failed to load curve trades";
      setError(String(msg));
      setLoading(false);
      // Keep previous points so UI doesn't thrash to empty every time a public RPC hiccups
    } finally {
      inFlightRef.current = false;
    }
  }, [campaignAddress, readProvider, chainId]);

  // Near-realtime updates: listen for new blocks (JsonRpcProvider does this via polling).
  useEffect(() => {
    fetchTrades();
    if (!readProvider || !campaignAddress) return;

    const onBlock = () => {
      fetchTrades();
    };

    try {
      readProvider.on("block", onBlock);
    } catch {
      // ignore
    }

    // Fallback interval (in case block events are not supported)
    const t = setInterval(fetchTrades, 10_000);

    return () => {
      clearInterval(t);
      try {
        readProvider.off("block", onBlock);
      } catch {
        // ignore
      }
    };
  }, [fetchTrades, readProvider, campaignAddress]);

  return { points, loading, error };
}

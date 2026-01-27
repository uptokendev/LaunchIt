import { ethers } from "ethers";
import { getPublicRpcUrls, type SupportedChainId } from "./chainConfig";

// Cache 1 read provider per chain id
const providerCache = new Map<number, ethers.AbstractProvider>();

function networkName(chainId: number) {
  return chainId === 56 ? "bsc" : "bsc-testnet";
}

/**
 * Read-only JSON-RPC provider for public data (logs, reads).
 *
 * IMPORTANT:
 * - We DISABLE batching (batchMaxCount: 1) because public BSC endpoints
 *   often rate-limit when getLogs requests are batched.
 * - We set staticNetwork to avoid extra "detectNetwork" chatter.
 */
export function getReadProvider(chainId: SupportedChainId): ethers.AbstractProvider {
  const cached = providerCache.get(chainId);
  if (cached) return cached as any;

  const urls = getPublicRpcUrls(chainId);
  if (!urls.length) throw new Error(`Missing public RPC url for chainId=${chainId}`);

  // Pin network to avoid ethers "network changed" errors when the wallet/network flips or
  // when an endpoint is flaky during detection.
  const network = ethers.Network.from(chainId);
  (network as any).name = networkName(chainId);

  const mk = (url: string) =>
    new ethers.JsonRpcProvider(
      url,
      network,
      {
        // IMPORTANT: In ethers v6, set staticNetwork to the Network object (not boolean).
        staticNetwork: network,
        // Disable batching to reduce "-32005 rate limit" issues
        batchMaxCount: 1,
        batchStallTime: 0,
      } as any
    );

  const provider: ethers.AbstractProvider =
    urls.length === 1
      ? mk(urls[0])
      : new ethers.FallbackProvider(
          urls.map((u) => ({ provider: mk(u), weight: 1, priority: 1 })),
          network
        );

  providerCache.set(chainId, provider);
  return provider;
}

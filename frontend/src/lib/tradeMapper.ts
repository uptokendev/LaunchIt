import type { RawTradeEvent } from "@/types/token";
import type { Transaction } from "@/types/token";

// later you can pass in a BNB/USD price feed or metrics
export function mapRawTradeToTransaction(
  raw: RawTradeEvent,
  opts?: { bnbUsdPrice?: number; marketCapUsd?: number }
): Transaction {
  const date = new Date(raw.timestamp * 1000);

  const usdValue =
    opts?.bnbUsdPrice != null
      ? (Number(raw.baseAmountWei) / 1e18) * opts.bnbUsdPrice
      : Number(raw.baseAmountWei) / 1e18; // fallback: treat baseAmount as “USD-like” for now

  return {
    time: date.toLocaleTimeString(), // e.g. "14:32:11" (you can switch to relative-time if you prefer)
    type: raw.side,
    usd: Number(usdValue.toFixed(2)),
    amount: (Number(raw.tokenAmount) / 1e9).toFixed(0), // adjust decimals to your token (18, 9, etc.)
    sol: Number((Number(raw.baseAmountWei) / 1e18).toFixed(4)), // this is “BNB” in your app; we keep the field name for now
    mcap:
      opts?.marketCapUsd != null
        ? `$${opts.marketCapUsd.toLocaleString()}`
        : "$0",
    trader: shortenAddress(raw.trader),
    tx: raw.txHash,
  };
}

function shortenAddress(addr: string): string {
  if (!addr) return "";
  return addr.length > 10
    ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
    : addr;
}

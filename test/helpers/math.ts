import { BigNumberish } from "ethers";

const WAD = 10n ** 18n;
const MAX_BPS = 10_000n;

export function bn(x: BigNumberish): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") return BigInt(x);
  if (typeof x === "string") return BigInt(x);
  // ethers BigNumber (v5) or bigint-like object
  // @ts-ignore
  if (x && typeof x.toString === "function") return BigInt(x.toString());
  throw new Error("Unsupported BigNumberish");
}

export function area(x: bigint, basePrice: bigint, priceSlope: bigint): bigint {
  // Matches LaunchCampaign._area:
  // linear = x*basePrice / 1e18
  // slopeTerm = priceSlope * x^2 / (2 * 1e36)
  const linear = (x * basePrice) / WAD;
  const square = x * x;
  const denom = 2n * WAD * WAD;
  const slopeTerm = (priceSlope * square) / denom;
  return linear + slopeTerm;
}

export function fee(amountWei: bigint, protocolFeeBps: bigint): bigint {
  if (protocolFeeBps === 0n) return 0n;
  return (amountWei * protocolFeeBps) / MAX_BPS;
}

export function quoteBuyExactTokens(
  sold: bigint,
  amountOut: bigint,
  basePrice: bigint,
  priceSlope: bigint,
  protocolFeeBps: bigint
): { costNoFee: bigint; fee: bigint; total: bigint } {
  const costNoFee = area(sold + amountOut, basePrice, priceSlope) - area(sold, basePrice, priceSlope);
  const f = fee(costNoFee, protocolFeeBps);
  return { costNoFee, fee: f, total: costNoFee + f };
}

export function quoteSellExactTokens(
  sold: bigint,
  amountIn: bigint,
  basePrice: bigint,
  priceSlope: bigint,
  protocolFeeBps: bigint
): { gross: bigint; fee: bigint; payout: bigint } {
  const gross = area(sold, basePrice, priceSlope) - area(sold - amountIn, basePrice, priceSlope);
  const f = fee(gross, protocolFeeBps);
  return { gross, fee: f, payout: gross - f };
}

export function currentPrice(basePrice: bigint, priceSlope: bigint, sold: bigint): bigint {
  // basePrice + priceSlope * sold / 1e18
  return basePrice + (priceSlope * sold) / WAD;
}

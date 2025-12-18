export type TokenStatus = "bonding" | "graduated" | "unknown";

export interface TokenSearchResult {
  campaignAddress: string; // 0x...
  tokenAddress?: string; // 0x...
  name: string;
  symbol: string;
  status: TokenStatus;
  logoURI?: string;
}

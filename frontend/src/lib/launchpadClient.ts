import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { useWallet } from "@/hooks/useWallet";
import { useCallback } from "react";
import { USE_MOCK_DATA } from "@/config/mockConfig";

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS ?? "";

const FACTORY_ABI = LaunchFactoryArtifact.abi as ethers.InterfaceAbi;
const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;

export type CampaignInfo = {
  id: number;
  campaign: string;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  logoURI: string;
  xAccount: string;
  website: string;
  extraLink: string;

  // Optional DEX metadata for charts
  dexPairAddress?: string;
  dexScreenerUrl?: string;
};

export type CampaignMetrics = {
  sold: bigint;
  curveSupply: bigint;
  liquiditySupply: bigint;
  creatorReserve: bigint;
  currentPrice: bigint;
  basePrice: bigint;
  priceSlope: bigint;
  graduationTarget: bigint;
  liquidityBps: bigint;
  protocolFeeBps: bigint;
};

// ---------------- MOCK DATA (used when USE_MOCK_DATA === true) ----------------

const MOCK_CAMPAIGNS: CampaignInfo[] = [
  {
    id: 1,
    campaign: "0x1111111111111111111111111111111111111111",
    token: "0x2222222222222222222222222222222222222222",
    creator: "0x3333333333333333333333333333333333333333",
    name: "LaunchIT Mock Token",
    symbol: "LIT",
    logoURI: "/placeholder.svg", // or some logo in /public
    xAccount: "https://x.com/launchit_mock",
    website: "https://launchit.mock",
    extraLink: "The first mock campaign for testing the UI.",

    // mock DEX pair: always show this chart in mock mode
    dexPairAddress: "0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
    dexScreenerUrl:
      "https://dexscreener.com/bsc/0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
  },
  {
    id: 2,
    campaign: "0x4444444444444444444444444444444444444444",
    token: "0x5555555555555555555555555555555555555555",
    creator: "0x6666666666666666666666666666666666666666",
    name: "Second Mock Token",
    symbol: "MOCK2",
    logoURI: "/placeholder.svg",
    xAccount: "",
    website: "",
    extraLink: "Another mock project for carousel & details.",

    // You can reuse the same chart or leave undefined.
    dexPairAddress: "0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
    dexScreenerUrl:
      "https://dexscreener.com/bsc/0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
  },
];

const MOCK_METRICS_BY_CAMPAIGN: Record<string, CampaignMetrics> = {
  "0x1111111111111111111111111111111111111111": {
    sold: 1_000_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 1_000_000_000_000_000n, // 0.001 in 18 decimals
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 10_000_000_000_000_000_000n,
    liquidityBps: 5000n,
    protocolFeeBps: 200n,
  },
  "0x4444444444444444444444444444444444444444": {
    sold: 500_000n,
    curveSupply: 500_000n,
    liquiditySupply: 250_000n,
    creatorReserve: 250_000n,
    currentPrice: 500_000_000_000_000n,
    basePrice: 250_000_000_000_000n,
    priceSlope: 5_000_000_000_000n,
    graduationTarget: 5_000_000_000_000_000_000n,
    liquidityBps: 5000n,
    protocolFeeBps: 200n,
  },
};


export function useLaunchpad() {
  const { provider, signer } = useWallet();

  const getFactory = useCallback(() => {
    if (!provider || !FACTORY_ADDRESS) return null;
    return new Contract(
      FACTORY_ADDRESS,
      FACTORY_ABI,
      signer ?? provider
    ) as any;
  }, [provider, signer]);

  const getCampaign = useCallback(
    (address: string) => {
      if (!provider) return null;
      return new Contract(
        address,
        CAMPAIGN_ABI,
        signer ?? provider
      ) as any;
    },
    [provider, signer]
  );

  // --- READS ---

    const fetchCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
    // 🔹 MOCK MODE: just return mock data
    if (USE_MOCK_DATA) {
      return MOCK_CAMPAIGNS;
    }

    const factory = getFactory();
    if (!factory) return [];

    const total: bigint = await factory.campaignsCount();
    if (total === 0n) return [];

    const totalNumber = Number(total);
    const limit = Math.min(totalNumber, 25);
    const offset = Math.max(0, totalNumber - limit);
    const page = await factory.getCampaignPage(offset, limit);

    return page.map((c: any) => ({
      id: Number(c.id),
      campaign: c.campaign,
      token: c.token,
      creator: c.creator,
      name: c.name,
      symbol: c.symbol,
      logoURI: c.logoURI,
      xAccount: c.xAccount,
      website: c.website,
      extraLink: c.extraLink,
      dexScreenerUrl: c.dexScreenerUrl || "",
    })) as CampaignInfo[];
  }, [getFactory]);


    const fetchCampaignMetrics = useCallback(
    async (campaignAddress: string): Promise<CampaignMetrics | null> => {
      // 🔹 MOCK MODE
      if (USE_MOCK_DATA) {
        return (
          MOCK_METRICS_BY_CAMPAIGN[campaignAddress.toLowerCase()] ??
          MOCK_METRICS_BY_CAMPAIGN[campaignAddress] ??
          null
        );
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign) return null;

      const [
        sold,
        curveSupply,
        liquiditySupply,
        creatorReserve,
        basePrice,
        priceSlope,
        graduationTarget,
        liquidityBps,
        protocolFeeBps,
        currentPrice,
      ] = await Promise.all([
        campaign.sold(),
        campaign.curveSupply(),
        campaign.liquiditySupply(),
        campaign.creatorReserve(),
        campaign.basePrice(),
        campaign.priceSlope(),
        campaign.graduationTarget(),
        campaign.liquidityBps(),
        campaign.protocolFeeBps(),
        campaign.currentPrice(),
      ]);

      return {
        sold,
        curveSupply,
        liquiditySupply,
        creatorReserve,
        basePrice,
        priceSlope,
        graduationTarget,
        liquidityBps,
        protocolFeeBps,
        currentPrice,
      };
    },
    [getCampaign]
  );


  // --- WRITES ---

    const createCampaign = useCallback(
    async (params: {
      name: string;
      symbol: string;
      logoURI: string;
      xAccount: string;
      website: string;
      extraLink: string;
      basePriceWei?: bigint;
      priceSlopeWei?: bigint;
      graduationTargetWei?: bigint;
      lpReceiver?: string;
    }) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] createCampaign", params);
        // Option: simulate a short delay
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 }; // minimal "success" shape
      }

            const factory = getFactory();
      if (!factory || !signer) throw new Error("Wallet not connected");

      const writer = factory.connect(signer) as any;
      const tx = await writer.createCampaign({
        name: params.name,
        symbol: params.symbol,
        logoURI: params.logoURI,
        xAccount: params.xAccount,
        website: params.website,
        extraLink: params.extraLink,
        basePrice: params.basePriceWei ?? 0n,
        priceSlope: params.priceSlopeWei ?? 0n,
        graduationTarget: params.graduationTargetWei ?? 0n,
        lpReceiver: params.lpReceiver || ethers.ZeroAddress,
      });

      return tx.wait();
    },
    [getFactory, signer]
  );

  const buyTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] buyTokens", { campaignAddress, amountWei, maxCostWei });
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 };
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign || !signer) throw new Error("Wallet not connected");

      const writer = campaign.connect(signer) as any;
      const tx = await writer.buyExactTokens(amountWei, maxCostWei, {
        value: maxCostWei,
      });
      return tx.wait();
    },
    [getCampaign, signer]
  );

  const sellTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] sellTokens", { campaignAddress, amountWei, minAmountWei });
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 };
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign || !signer) throw new Error("Wallet not connected");

      const writer = campaign.connect(signer) as any;
      const tx = await writer.sellExactTokens(amountWei, minAmountWei);
      return tx.wait();
    },
    [getCampaign, signer]
  );

  const finalizeCampaign = useCallback(
    async (campaignAddress: string, minTokens: bigint, minBnb: bigint) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] finalizeCampaign", { campaignAddress, minTokens, minBnb });
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 };
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign || !signer) throw new Error("Wallet not connected");

      const writer = campaign.connect(signer) as any;
      const tx = await writer.finalize(minTokens, minBnb);
      return tx.wait();
    },
    [getCampaign, signer]
  );


  return {
    fetchCampaigns,
    fetchCampaignMetrics,
    createCampaign,
    buyTokens,
    sellTokens,
    finalizeCampaign,
  };
}

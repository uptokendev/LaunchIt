/**
 * Token Details Page
 * Displays comprehensive information about a specific token including
 * chart, trading interface, transactions, and holder distribution
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, ExternalLink, Globe, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { mockTokenData, mockTransactions } from "@/constants/mockData";
import twitterIcon from "@/assets/social/twitter.png";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { useDexScreenerChart } from "@/hooks/useDexScreenerChart";
import { CurvePriceChart } from "@/components/token/CurvePriceChart";
import { USE_MOCK_DATA } from "@/config/mockConfig";
import { getMockCurveEventsForSymbol } from "@/constants/mockCurveTrades";

const TokenDetails = () => {
  // URL param: /token/:id  (we currently use ticker in the URL)
  const { id } = useParams<{ id: string }>();

  const { toast } = useToast();
  const [tradeAmount, setTradeAmount] = useState("0");
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const handleTradeTabChange = (value: string) => {
    setTradeTab(value as "buy" | "sell");
  };
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    "5m" | "1h" | "4h" | "24h"
  >("24h");
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const isMobile = window.innerWidth < 768;

  // Launchpad hooks + state for the on-chain data
  const { fetchCampaigns, fetchCampaignMetrics } = useLaunchpad();
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load campaign + metrics based on :id (ticker)
  useEffect(() => {
    const load = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);

        const campaigns = await fetchCampaigns();

        if (!campaigns || campaigns.length === 0) {
          setError("No token data");
          setCampaign(null);
          setMetrics(null);
          return;
        }

        // We navigate with /token/${card.ticker.toLowerCase()}
        const match = campaigns.find(
          (c) => c.symbol.toLowerCase() === id.toLowerCase()
        );

        if (!match) {
          setError("Token not found");
          setCampaign(null);
          setMetrics(null);
          return;
        }

        setCampaign(match);

        // Optional: basic metrics from campaign contract
        const m = await fetchCampaignMetrics(match.campaign);
        if (m) setMetrics(m);
      } catch (err) {
        console.error(err);
        setError("Failed to load token data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, fetchCampaigns, fetchCampaignMetrics]);

  // Merge mock UI data with real on-chain campaign info
  const tokenData = useMemo(() => {
    // Start with mock values so the UI always has something to show
    const base = mockTokenData;

    if (!campaign) return base;

    return {
      ...base,
      ticker: campaign.symbol,
      name: campaign.name,
      image: campaign.logoURI || base.image,
      // if you ever want to add contractAddress here, also extend the type of mockTokenData
      // contractAddress: campaign.token,
      // price: metrics ? Number(metrics.currentPrice) / 1e18 : base.price,
    };
  }, [campaign, metrics]);

  // 🔹 Dexscreener chart-only URL (mock or live) based on the token contract
  // In mock mode we still want to be able to test the internal bonding-curve chart.
  // For the special curve-test token (MOCK2) we force DexScreener OFF so the CurvePriceChart renders.
  const isCurveTestToken =
    (campaign?.symbol ?? tokenData.ticker ?? "").toUpperCase() === "MOCK2";

  const dexTokenAddress = isCurveTestToken ? "" : campaign?.token ?? "";

  const { url: chartUrl } = useDexScreenerChart(dexTokenAddress);
  const hasDexChart = !!chartUrl && !isCurveTestToken;

  const copyAddress = () => {
    const address = campaign?.token ?? "";
    if (!address) return;

    navigator.clipboard.writeText(address);
    toast({
      title: "Copied!",
      description: "Contract address copied to clipboard",
    });
  };

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center px-4">
        <Card className="p-4 md:p-6 bg-card/40 border border-border/40 max-w-md w-full text-center">
          <h2 className="text-sm md:text-base font-semibold mb-2">
            {error}
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            {error === "No token data"
              ? "There are no campaigns available yet."
              : "Please go back to the main page and select another token."}
          </p>
        </Card>
      </div>
    );
  }

  if (loading && !campaign) {
    return (
      <div className="h-full w-full flex items-center justify-center px-4">
        <Card className="p-4 md:p-6 bg-card/40 border border-border/40 max-w-md w-full text-center">
          <p className="text-xs md:text-sm text-muted-foreground">
            Loading token data...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden flex flex-col px-3 md:px-6 pt-3 md:pt-6 gap-3 md:gap-4">
      {/* Main Content - Single Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4 flex-1 min-h-0">
        {/* Left Column - Header, Chart & Transactions (3/4 width) */}
        <div className="lg:col-span-3 flex flex-col gap-3 md:gap-4 min-h-0">
          {/* Top Header Bar */}
          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-3 md:p-6 flex-shrink-0">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              {/* Token Image & Info */}
              <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
                <img
                  src={tokenData.image}
                  alt={tokenData.ticker}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-full flex-shrink-0"
                />

                <div className="flex flex-col gap-1.5 md:gap-2.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 md:gap-3">
                    <h1 className="text-sm md:text-lg font-retro text-foreground truncate">
                      {tokenData.name}
                    </h1>
                    <span className="text-xs md:text-sm text-muted-foreground font-mono">
                      {tokenData.ticker}
                    </span>
                    <Copy
                      className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex-shrink-0"
                      onClick={copyAddress}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2.5">
                    {tokenData.hasWebsite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 md:h-7 md:w-7 p-0 hover:bg-muted/50"
                      >
                        <Globe className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      </Button>
                    )}
                    {tokenData.hasTwitter && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 md:h-7 md:w-7 p-0 hover:bg-muted/50"
                      >
                        <img
                          src={twitterIcon}
                          alt="Twitter"
                          className="h-3 w-3 md:h-3.5 md:w-3.5"
                        />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 md:h-7 px-2 md:px-3 text-[10px] md:text-xs"
                    >
                      Community
                    </Button>
                  </div>
                </div>
              </div>

              {/* Vertical Separator - Desktop only */}
              <div className="hidden md:block h-14 w-px bg-border/50 flex-shrink-0" />

              {/* Market Cap */}
              <div className="flex items-center justify-between md:flex-col md:gap-1.5 md:flex-1 md:min-w-0">
                <p className="text-xs text-muted-foreground">Market cap</p>
                <div className="flex items-center gap-2 md:gap-3">
                  <h2 className="text-lg md:text-2xl font-retro text-foreground">
                    ${tokenData.marketCap}k
                  </h2>
                  <span
                    className={`text-xs md:text-sm font-mono ${
                      tokenData.marketCapChange < 0
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  >
                    {tokenData.marketCapChange > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(tokenData.marketCapChange)}%
                  </span>
                </div>
              </div>

              {/* Mobile: Expandable Metrics Section */}
              {isMobile && (
                <div className="w-full">
                  <button
                    onClick={() => setMetricsExpanded(!metricsExpanded)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg"
                  >
                    <span className="text-xs text-muted-foreground">
                      More metrics
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        metricsExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {metricsExpanded && (
                    <div className="mt-2 space-y-3 p-3 bg-muted/20 rounded-lg">
                      {/* Time-based percentage changes */}
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(tokenData.metrics).map(
                          ([key, data]) => (
                            <div
                              key={key}
                              onClick={() =>
                                setSelectedTimeframe(
                                  key as "5m" | "1h" | "4h" | "24h"
                                )
                              }
                              className={`cursor-pointer transition-all text-xs p-2 rounded-md ${
                                selectedTimeframe === key
                                  ? "bg-accent/20"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <span className="text-muted-foreground">
                                {key}
                              </span>
                              <span
                                className={`ml-2 font-mono ${
                                  (data as any).change < 0
                                    ? "text-red-500"
                                    : "text-green-500"
                                }`}
                              >
                                {(data as any).change > 0 ? "▲" : "▼"}{" "}
                                {Math.abs((data as any).change)}%
                              </span>
                            </div>
                          )
                        )}
                      </div>

                      {/* Additional metrics */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Price
                          </span>
                          <span className="font-mono text-foreground">
                            ${tokenData.price}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Liq.
                          </span>
                          <span className="font-mono text-foreground">
                            ${tokenData.liquidity}k
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Volume
                          </span>
                          <span className="font-mono text-foreground">
                            {tokenData.metrics[selectedTimeframe].volume}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">
                            Holders
                          </span>
                          <span className="font-mono text-foreground">
                            {tokenData.holders}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Desktop: Vertical Separator */}
              <div className="hidden lg:block h-14 w-px bg-border/50 flex-shrink-0" />

              {/* Desktop: Time-based Metrics & Additional Metrics */}
              <div className="hidden lg:flex flex-col gap-4 flex-[2] min-w-0">
                {/* Top Row - Time-based percentage changes (clickable) */}
                <div className="flex items-center justify-between gap-4">
                  {Object.entries(tokenData.metrics).map(([key, data]) => (
                    <div
                      key={key}
                      onClick={() =>
                        setSelectedTimeframe(
                          key as "5m" | "1h" | "4h" | "24h"
                        )
                      }
                      className={`cursor-pointer transition-all text-xs ${
                        selectedTimeframe === key
                          ? "opacity-100"
                          : "opacity-50 hover:opacity-75"
                      }`}
                    >
                      <span className="text-muted-foreground">{key}</span>
                      <span
                        className={`ml-2 font-mono ${
                          (data as any).change < 0
                            ? "text-red-500"
                            : "text-green-500"
                        }`}
                      >
                        {(data as any).change > 0 ? "▲" : "▼"}{" "}
                        {Math.abs((data as any).change)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Bottom Row - Price, Liq, Volume, Holders */}
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Price</span>
                    <span className="ml-2 font-mono text-foreground">
                      ${tokenData.price}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Liq.</span>
                    <span className="ml-2 font-mono text-foreground">
                      ${tokenData.liquidity}k
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="ml-2 font-mono text-foreground">
                      {tokenData.metrics[selectedTimeframe].volume}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Holders</span>
                    <span className="ml-2 font-mono text-foreground">
                      {tokenData.holders}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Chart */}
          <Card
  className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-0 md:p-0 overflow-hidden"
  style={{ flex: isMobile ? "3" : "2" }}
>
  {hasDexChart ? (
    // 🔹 Post-LP: Dexscreener chart-only view
    <iframe
      src={chartUrl!}
      title={`${tokenData.ticker} chart`}
      className="w-full h-[260px] md:h-full rounded-2xl border-0"
      allow="clipboard-write; clipboard-read; encrypted-media;"
    />
  ) : (
    // 🔹 Pre-LP: internal bonding-curve chart (live or mock)
    <CurvePriceChart
      campaignAddress={campaign?.campaign}
      mockMode={USE_MOCK_DATA}
      mockEvents={
        USE_MOCK_DATA
          ? getMockCurveEventsForSymbol(campaign?.symbol)
          : []
      }
    />
  )}
</Card>

          {/* Transactions Table */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4 flex flex-col min-h-0"
            style={{ flex: "1" }}
          >
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      Time
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      Type
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      USD
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      {tokenData.ticker}
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      BNB
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      MCap
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      Trader
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-normal">
                      TX
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mockTransactions.map((tx, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/20"
                    >
                      <td className="py-2 text-muted-foreground">{tx.time}</td>
                      <td
                        className={`py-2 ${
                          tx.type === "buy"
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {tx.type}
                      </td>
                      <td className="py-2 font-mono">${tx.usd}</td>
                      <td className="py-2 font-mono">{tx.amount}</td>
                      <td className="py-2 font-mono">{tx.sol}</td>
                      <td className="py-2 font-mono">{tx.mcap}</td>
                      <td className="py-2 font-mono">{tx.trader}</td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column - Trading Panel & Stats (1/3 width) */}
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
          {/* Trading Panel - 2/5 height */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4"
            style={{ flex: "2" }}
          >
            <Tabs value={tradeTab} onValueChange={handleTradeTabChange}>
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="buy" className="text-sm">
                  Buy
                </TabsTrigger>
                <TabsTrigger value="sell" className="text-sm">
                  Sell
                </TabsTrigger>
              </TabsList>
              <TabsContent value="buy" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      Amount
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Slippage: 5%
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-14 font-mono text-base focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="0"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        BNB
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                    >
                      25%
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                    >
                      50%
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                    >
                      100%
                    </Button>
                  </div>
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  <p>You will receive 0 {tokenData.ticker}</p>
                </div>
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-retro py-5">
                  Place Trade
                </Button>
              </TabsContent>
              <TabsContent value="sell" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      Amount
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Slippage: 5%
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-14 font-mono text-base focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="0"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        BNB
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                    >
                      25%
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                    >
                      50%
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                    >
                      100%
                    </Button>
                  </div>
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  <p>You will receive 0 {tokenData.ticker}</p>
                </div>
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-retro py-5">
                  Place Trade
                </Button>
              </TabsContent>
            </Tabs>
          </Card>

          {/* User Statistics - 2/5 height */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4"
            style={{ flex: "2" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-retro text-foreground">
                Flywheel statistics
              </h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </Button>
                <span className="text-xs text-muted-foreground">Share</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-4 bg-accent rounded-full" />
                <span className="text-muted-foreground">Invested</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Invested
                  </p>
                  <p className="text-xl font-retro text-foreground">$0</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tokens burned
                  </p>
                  <p className="text-xl font-retro text-foreground flex items-center gap-1">
                    0.000%
                    <span className="text-xs text-muted-foreground">
                      ${tokenData.ticker}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Holder Distribution - 1/5 height */}
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4 flex flex-col min-h-0"
            style={{ flex: "1" }}
          >
            <h3 className="text-sm font-retro text-foreground mb-3 flex-shrink-0">
              Holder Distribution
            </h3>
            <div className="space-y-2 overflow-auto flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">1. 42me...</span>
                <span className="font-mono text-muted-foreground">
                  100.000%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono">2. Bzdb... 🔥 (DEV)</span>
                <span className="font-mono text-muted-foreground">
                  0.000%
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TokenDetails;

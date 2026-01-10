import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Globe, Users, DollarSign, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";
import type { Token } from "@/types/token";

// ---- Types ----
type CarouselCard = {
  id: number;
  image: string;
  ticker: string;
  tokenName: string;
  campaignAddress?: string; // LaunchCampaign address
  tokenAddress?: string;    // LaunchToken address (post-graduation)
  contractAddress: string;  // shown/copied in UI (usually token address)
  description: string;
  marketCap: string;
  holders: string;
  volume: string;
  links: { website?: string; twitter?: string; telegram?: string; discord?: string };
};

// ---- Placeholder data ----
const placeholderCards: CarouselCard[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  image: "/placeholder.svg",
  ticker: "TKN",
  tokenName: "Placeholder Token",
  campaignAddress: "0x0000000000000000000000000000000000000000",
  tokenAddress: "0x0000000000000000000000000000000000000000",
  contractAddress: "0x0000000000000000000000000000000000000000",
  description: "This is a placeholder token description.",
  marketCap: "$0",
  holders: "0",
  volume: "$0",
  links: {},
}));

export default function Example() {
  const navigate = useNavigate();
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cards, setCards] = useState<CarouselCard[]>(placeholderCards);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Fetch campaigns
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const campaigns = await fetchCampaigns();
        if (!campaigns?.length) return;

        const mapped: CarouselCard[] = await Promise.all(
          campaigns.map(async (c: CampaignInfo, i: number) => {
            // Pull stats (same as other pages)
            let marketCap = "—";
            let holders = "—";
            let volume = "—";

            try {
              const s = await fetchCampaignSummary(c);
              marketCap = s?.stats?.marketCap ?? "—";
              holders = s?.stats?.holders ?? "—";
              volume = s?.stats?.volume ?? "—";
            } catch {
              // ignore
            }

            return {
              id: i + 1,
              image: c.logoURI || "/placeholder.svg",
              ticker: (c.symbol ?? "").toUpperCase(),
              tokenName: c.name ?? "Token",

              // IMPORTANT: navigation uses campaign address (TokenDetails expects /token/:campaignAddress)
              campaignAddress: String((c as any).campaign ?? ""),

              // Token contract exists even pre-graduation in your system
              tokenAddress: String((c as any).token ?? ""),

              // Used for copy button / UI (prefer token, fallback campaign)
              contractAddress: String(((c as any).token ?? (c as any).campaign) ?? ""),

              description: c.description || "—",
              marketCap,
              holders,
              volume,
              links: {
                website: c.website || undefined,
                twitter: c.xAccount || undefined,
                telegram: (c as any).telegram || undefined,
                discord: (c as any).discord || undefined,
              },
            };
          })
        );

        if (!cancelled) setCards(mapped);
      } catch (e) {
        console.warn("[Showcase] Failed to load campaigns", e);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignSummary]);

  // Scroll to active card on index changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = container.querySelectorAll<HTMLElement>("[data-card]");
    const el = children[activeIndex];
    if (!el) return;

    const left = el.offsetLeft - (container.clientWidth - el.clientWidth) / 2;
    container.scrollTo({ left, behavior: "smooth" });
  }, [activeIndex]);

  const scrollByCards = (direction: "left" | "right") => {
    const next =
      direction === "left"
        ? Math.max(0, activeIndex - 1)
        : Math.min(cards.length - 1, activeIndex + 1);

    setActiveIndex(next);
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="relative flex-1 min-h-0">
        {/* Scroll Buttons */}
        <div className="absolute z-20 top-1/2 -translate-y-1/2 left-2 md:left-4 pointer-events-none">
          <button
            className="pointer-events-auto rounded-full bg-card/60 backdrop-blur border border-border/50 h-9 w-9 flex items-center justify-center hover:bg-card/80 transition"
            onClick={() => scrollByCards("left")}
            aria-label="Scroll left"
          >
            <span className="text-xl leading-none">‹</span>
          </button>
        </div>

        <div className="absolute z-20 top-1/2 -translate-y-1/2 right-2 md:right-4 pointer-events-none">
          <button
            className="pointer-events-auto rounded-full bg-card/60 backdrop-blur border border-border/50 h-9 w-9 flex items-center justify-center hover:bg-card/80 transition"
            onClick={() => scrollByCards("right")}
            aria-label="Scroll right"
          >
            <span className="text-xl leading-none">›</span>
          </button>
        </div>

        {/* Cards */}
        <div
          ref={containerRef}
          className="h-full w-full overflow-x-auto overflow-y-hidden whitespace-nowrap scroll-smooth no-scrollbar px-4 md:px-8"
        >
          <div className="inline-flex gap-4 md:gap-6 h-full items-stretch py-6">
            {cards.map((card, i) => (
              <CarouselCardView
                key={`${card.ticker}-${i}`}
                card={card}
                index={i}
                isActive={i === activeIndex}
                onActivate={() => setActiveIndex(i)}
                copiedIndex={copiedIndex}
                setCopiedIndex={setCopiedIndex}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CarouselCardView({
  card,
  index,
  isActive,
  onActivate,
  copiedIndex,
  setCopiedIndex,
}: {
  card: CarouselCard;
  index: number;
  isActive: boolean;
  onActivate: () => void;
  copiedIndex: number | null;
  setCopiedIndex: (n: number | null) => void;
}) {
  const navigate = useNavigate();

  const onClick = () => onActivate();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card.contractAddress) return;

    try {
      await navigator.clipboard.writeText(card.contractAddress);
      setCopiedIndex(index);
      toast.success("Copied contract address");
      setTimeout(() => setCopiedIndex(null), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleClick = () => {
    const addr = (card.campaignAddress ?? "").trim();
    const isDummy = !addr || /^0x0{40}$/.test(addr);

    if (isActive && !isDummy) {
      // Navigate to token details if centered/highlighted AND we have a real campaign address
      navigate(`/token/${addr.toLowerCase()}`);
      return;
    }

    // Otherwise just center the card
    onClick();
  };

  return (
    <div
      data-card
      onClick={handleClick}
      className={`relative shrink-0 w-[300px] md:w-[360px] h-full rounded-2xl border transition-all duration-300 overflow-hidden cursor-pointer ${
        isActive ? "border-primary/50 scale-[1.02]" : "border-border/40 opacity-90 hover:opacity-100"
      }`}
    >
      <GlowingEffect spread={40} blur={20} borderWidth={2} />
      <div className="relative h-full bg-card/30 backdrop-blur-md p-4 md:p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img
            src={card.image}
            alt={card.ticker}
            className="h-10 w-10 rounded-full border border-border/40"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold truncate">{card.tokenName}</div>
              <div className="text-xs text-muted-foreground font-mono">{card.ticker}</div>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{card.description}</div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-border/40 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              MCap
            </div>
            <div className="font-mono mt-1">{card.marketCap}</div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3 w-3" />
              Holders
            </div>
            <div className="font-mono mt-1">{card.holders}</div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Vol
            </div>
            <div className="font-mono mt-1">{card.volume}</div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {card.links.website ? (
              <button
                className="h-8 w-8 rounded-full border border-border/40 bg-background/30 flex items-center justify-center hover:bg-background/50 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(card.links.website, "_blank", "noopener,noreferrer");
                }}
                aria-label="Website"
              >
                <Globe className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <button
            className="h-8 px-3 rounded-lg border border-border/40 bg-background/30 flex items-center gap-2 hover:bg-background/50 transition text-xs"
            onClick={handleCopy}
            aria-label="Copy contract"
          >
            {copiedIndex === index ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
        </div>

        {!isActive ? (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground bg-background/40 border border-border/40 rounded-full px-2 py-0.5">
            Click to focus
          </div>
        ) : (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground bg-background/40 border border-border/40 rounded-full px-2 py-0.5">
            Click again to open
          </div>
        )}
      </div>
    </div>
  );
}

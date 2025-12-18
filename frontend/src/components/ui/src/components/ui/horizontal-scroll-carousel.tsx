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
  contractAddress: string;
  description: string;
  marketCap: string;
  holders: string;
  volume: string;
  links: { website?: string; twitter?: string; telegram?: string; discord?: string };
};

// ---- Placeholder data used when there are no on-chain campaigns yet ----
const PLACEHOLDER_CARDS: CarouselCard[] = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=400&h=400&fit=crop",
    ticker: "LAUNCH",
    tokenName: "LaunchIt Preview",
    contractAddress: "0x0000000000000000000000000000000000000000",
    description: "Your first bonding curve token will appear here once deployed.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=400&h=400&fit=crop",
    ticker: "COMING",
    tokenName: "Coming Soon",
    contractAddress: "0x0000000000000000000000000000000000000000",
    description: "Create a campaign to turn this placeholder into a live token.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1516245834210-c4c142787335?w=400&h=400&fit=crop",
    ticker: "UPONLY",
    tokenName: "Sample Token",
    contractAddress: "0x0000000000000000000000000000000000000000",
    description: "This is demo data while we wait for the first launch.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
];

// Responsive card sizing (we size to the container to keep the page scroll-free)
const CARD_GAP = 16;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const computeCardWidth = (containerW: number, containerH: number) => {
  // The centered card scales up, so we size the base card to guarantee it still fits.
  const isMobile = containerW < 768;
  const maxScale = isMobile ? 1.06 : 1.22;

  const min = isMobile ? 220 : 260;
  const max = isMobile ? 300 : 420;

  // Height is the limiting factor on most desktops (TopBar + footer). Keep some headroom.
  const byHeight = Math.floor((containerH * 0.9) / maxScale);

  // Width determines how much "presence" the card has while still showing neighbours.
  const byWidth = Math.floor(containerW * (isMobile ? 0.72 : 0.34));

  return clamp(Math.min(byHeight, byWidth, max), min, max);
};

const Example = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const lastDeltaRef = useRef(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const hasInitialized = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cardSize, setCardSize] = useState<{ width: number; totalWidth: number }>({
    width: 320,
    totalWidth: 320 + CARD_GAP,
  });
  const { width: CARD_WIDTH, totalWidth: TOTAL_CARD_WIDTH } = cardSize;

  // Keep card sizing synced to the available container size (prevents vertical scroll/clipping).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 1024);
      const h = el.offsetHeight || (typeof window !== "undefined" ? window.innerHeight : 768);
      setIsMobile(w < 768);
      const width = computeCardWidth(w, h);
      setCardSize({ width, totalWidth: width + CARD_GAP });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Blockchain campaigns -> cards
  const { fetchCampaigns, fetchCampaignCardStats } = useLaunchpad();
  const [cards, setCards] = useState<CarouselCard[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  // This is the array we actually render:
  // - real on-chain campaigns if available
  // - otherwise placeholder cards
  const displayCards: CarouselCard[] = cards.length ? cards : PLACEHOLDER_CARDS;

  // Scroll position (initially 0, we correct it in an effect once we know card count)
  const [scrollPosition, setScrollPosition] = useState(0);

  // Fetch campaigns on mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingCampaigns(true);
        setCampaignError(null);

        const campaigns: CampaignInfo[] = await fetchCampaigns();

        const mapped: CarouselCard[] = await Promise.all(
          campaigns.map(async (c) => {
            const stats = await fetchCampaignCardStats(c);

            return {
              id: c.id,
              image: c.logoURI || "/placeholder.svg",
              ticker: c.symbol,
              tokenName: c.name,
              campaignAddress: c.campaign, // ✅ add this
              tokenAddress: c.token,
              contractAddress: c.token,
              description: c.extraLink || "",
              marketCap: stats.marketCap,
              holders: stats.holders,
              volume: stats.volume,
              links: {
                website: c.website || undefined,
                twitter: c.xAccount || undefined,
                telegram: (c as any).telegram || undefined,
                discord: (c as any).discord || undefined,
              },
            };
          })
        );

        setCards(mapped);
      } catch (err) {
        console.error(err);
        setCampaignError("Failed to load campaigns");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    load();
  }, [fetchCampaigns]);

  // Save scroll position to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem("carousel-position", scrollPosition.toString());
  }, [scrollPosition]);

  // Initialize to center the first card on first mount, once we know how many cards we have
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (!displayCards.length) return;

    const stored = sessionStorage.getItem("carousel-position");

    if (!hasInitialized.current) {
      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      if (!stored) {
        // No stored position - center the first card of the middle set
        const containerWidth = scrollContainerRef.current.offsetWidth;
        const firstCardCenter = singleSetWidth + CARD_WIDTH / 2;
        const targetPosition = firstCardCenter - containerWidth / 2;
        setScrollPosition(targetPosition);
      } else {
        // Has stored position - trigger a snap to ensure proper highlighting
        setTimeout(() => {
          if (!scrollContainerRef.current) return;
          const containerWidth = scrollContainerRef.current.offsetWidth;
          const storedPos = parseFloat(stored);
          const viewportCenter = storedPos + containerWidth / 2;
          const fIndex = (viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH;
          let baseIndex = Math.round(fIndex);
          const cardCenter = baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
          const rawTarget = cardCenter - containerWidth / 2;
          const W = singleSetWidth;
          const candidateShifts = [-2, -1, 0, 1, 2];
          let best = rawTarget,
            bestDist = Number.POSITIVE_INFINITY;
          for (const k of candidateShifts) {
            let c = rawTarget + k * W;
            if (c < W) c += W;
            else if (c >= 2 * W) c -= W;
            const d = Math.abs(c - storedPos);
            if (d < bestDist) {
              best = c;
              bestDist = d;
            }
          }
          setScrollPosition(best);
          setIsSnapping(true);
          setTimeout(() => setIsSnapping(false), 600);
        }, 100);
      }
      hasInitialized.current = true;
    }
  }, [displayCards.length, TOTAL_CARD_WIDTH, CARD_WIDTH]);

  // If the container resizes (or the card size changes), re-snap to the nearest card
  // so the highlight and glow always align perfectly.
  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!scrollContainerRef.current) return;
    if (!displayCards.length) return;

    const container = scrollContainerRef.current;
    const containerWidth = container.offsetWidth;
    const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;
    if (!singleSetWidth) return;

    const t = setTimeout(() => {
      setScrollPosition((currentPos) => {
        const viewportCenter = currentPos + containerWidth / 2;
        const fIndex = (viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH;
        const baseIndex = Math.round(fIndex);
        const cardCenter = baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
        const rawTarget = cardCenter - containerWidth / 2;

        const W = singleSetWidth;
        const candidateShifts = [-2, -1, 0, 1, 2];
        let best = rawTarget;
        let bestDist = Number.POSITIVE_INFINITY;

        for (const k of candidateShifts) {
          let c = rawTarget + k * W;
          if (c < W) c += W;
          else if (c >= 2 * W) c -= W;
          const d = Math.abs(c - currentPos);
          if (d < bestDist) {
            best = c;
            bestDist = d;
          }
        }

        return best;
      });

      setIsSnapping(true);
      setTimeout(() => setIsSnapping(false), 450);
    }, 50);

    return () => clearTimeout(t);
  }, [CARD_WIDTH, TOTAL_CARD_WIDTH, displayCards.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!displayCards.length) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastDeltaRef.current = e.deltaY;

      // Cancel ongoing snap
      if (isSnapping) {
        setIsSnapping(false);
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      // Smooth scroll with edge re-centering
      setScrollPosition((prev) => {
        const W = singleSetWidth;
        const total = W * 3;
        let newPosition = prev + e.deltaY * 0.6; // reduced sensitivity

        if (!W) return prev; // safety

        // First, wrap to stay within [0, 3W)
        while (newPosition < 0) newPosition += W;
        while (newPosition >= total) newPosition -= W;

        // Recenter to middle set if we're getting too close to edges
        if (newPosition < W * 0.5) {
          newPosition += W;
        } else if (newPosition >= W * 2.5) {
          newPosition -= W;
        }

        return newPosition;
      });

      // Snap after user stops scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        snapToNearestCard();
      }, 150);
    };

    const snapToNearestCard = () => {
      if (!displayCards.length) return;

      const containerWidth = container.offsetWidth;
      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      setScrollPosition((currentPos) => {
        if (!singleSetWidth) return currentPos;

        const viewportCenter = currentPos + containerWidth / 2;
        const fIndex = (viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH;
        let baseIndex = Math.round(fIndex);
        if (lastDeltaRef.current > 0 && baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2 < viewportCenter) {
          baseIndex += 1;
        } else if (
          lastDeltaRef.current < 0 &&
          baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2 > viewportCenter
        ) {
          baseIndex -= 1;
        }
        const cardCenter = baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
        const rawTarget = cardCenter - containerWidth / 2;
        const W = singleSetWidth;
        const candidateShifts = [-2, -1, 0, 1, 2];
        let best = rawTarget,
          bestDist = Number.POSITIVE_INFINITY;
        for (const k of candidateShifts) {
          let c = rawTarget + k * W;
          if (c < W) c += W;
          else if (c >= 2 * W) c -= W;
          const d = Math.abs(c - currentPos);
          if (d < bestDist) {
            best = c;
            bestDist = d;
          }
        }
        return best;
      });

      setIsSnapping(true);
      setTimeout(() => setIsSnapping(false), 600);
    };

    // Handle window resize (card size is already updated by ResizeObserver; we just re-snap)
    const handleResize = () => {
      snapToNearestCard();
    };

    // Handle touch events for mobile swipe
    let touchStartX = 0;
    let touchStartScrollPos = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartScrollPos = scrollPosition;
      if (isSnapping) setIsSnapping(false);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchX = e.touches[0].clientX;
      const deltaX = touchStartX - touchX;
      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      setScrollPosition(() => {
        const W = singleSetWidth;
        if (!W) return touchStartScrollPos;

        let newPosition = touchStartScrollPos + deltaX;

        while (newPosition < 0) newPosition += W;
        while (newPosition >= W * 3) newPosition -= W;

        if (newPosition < W * 0.5) {
          newPosition += W;
        } else if (newPosition >= W * 2.5) {
          newPosition -= W;
        }

        return newPosition;
      });
    };

    const handleTouchEnd = () => {
      scrollTimeoutRef.current = setTimeout(() => {
        snapToNearestCard();
      }, 100);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", handleResize);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [displayCards.length, isSnapping, scrollPosition, TOTAL_CARD_WIDTH, CARD_WIDTH]);

  // Calculate which absolute card index is centered for highlighting
  const getCenteredAbsIndex = () => {
    if (!scrollContainerRef.current || !displayCards.length) return 0;
    const containerWidth = scrollContainerRef.current.offsetWidth;
    const viewportCenter = scrollPosition + containerWidth / 2;
    const absIndex = Math.round((viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH);
    return absIndex;
  };

  const centeredAbsIndex = getCenteredAbsIndex();
  const totalTriple = displayCards.length * 3 || 1;
  const centeredTripleIndex = ((centeredAbsIndex % totalTriple) + totalTriple) % totalTriple;

  // Handle card click to snap it to center
  const handleCardClick = (clickedIndex: number) => {
    if (!scrollContainerRef.current || !displayCards.length) return;
    const containerWidth = scrollContainerRef.current.offsetWidth;
    const W = TOTAL_CARD_WIDTH * displayCards.length;

    if (!W) return;

    // Center of the exact clicked instance in the triple set
    const clickedCenter = clickedIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
    const rawTarget = clickedCenter - containerWidth / 2;

    setScrollPosition((currentPos) => {
      // Pick the nearest equivalent target by shifting by +/- W and +/- 2W
      const candidates = [rawTarget - 2 * W, rawTarget - W, rawTarget, rawTarget + W, rawTarget + 2 * W];
      let best = candidates[0];
      let bestDist = Infinity;
      for (let c of candidates) {
        let cn = c;
        if (cn < W) cn += W;
        else if (cn >= 2 * W) cn -= W;
        const d = Math.abs(cn - currentPos);
        if (d < bestDist) {
          best = cn;
          bestDist = d;
        }
      }
      return best;
    });

    setIsSnapping(true);
    setTimeout(() => setIsSnapping(false), 600);
  };
  return (
    <div
      ref={scrollContainerRef}
      className="h-full w-full flex items-center overflow-hidden relative touch-pan-x scrollbar-hidden"
      style={{
        maskImage: isMobile
          ? "none"
          : "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        WebkitMaskImage: isMobile
          ? "none"
          : "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div
        className="flex items-center"
        style={{
          transform: `translateX(-${scrollPosition}px)`,
          transition: isSnapping
            ? "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "none",
          gap: `${CARD_GAP}px`,
        }}
      >
      {import.meta.env.DEV && (
        <div className="absolute top-2 right-2 z-50 text-xs bg-black/60 p-2 rounded text-white pointer-events-auto">
          <div className="whitespace-nowrap">container: {scrollContainerRef.current?.offsetWidth ?? "—"}</div>
          <div>CARD_W: {CARD_WIDTH}</div>
          <div>TOTAL_W: {TOTAL_CARD_WIDTH}</div>
          <div>pos: {Math.round(scrollPosition)}</div>
          <div>centerIdx: {centeredAbsIndex}</div>
          <div className="mt-1 flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                sessionStorage.removeItem("carousel-position");
                setScrollPosition(0);
              }}
              className="px-2 py-1 rounded bg-accent/20 text-accent"
            >
              Reset
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // force re-snap
                setScrollPosition((s) => s);
              }}
              className="px-2 py-1 rounded bg-muted/20 text-muted-foreground"
            >
              Snap
            </button>
          </div>
        </div>
      )}
        {/* Render cards 3 times for seamless infinite scroll */}
        {[...displayCards, ...displayCards, ...displayCards].map((card, index) => {
          const isCentered = index === centeredTripleIndex;
          return (
            <Card
              card={card}
              key={`${card.id}-${index}`}
              isCentered={isCentered}
              cardWidth={CARD_WIDTH}
              isMobile={isMobile}
              onClick={() => handleCardClick(index)}
            />
          );
        })}
      </div>
    </div>
  );
};

const Card = ({
  card,
  isCentered,
  cardWidth,
  isMobile,
  onClick,
}: {
  card: CarouselCard;
  isCentered: boolean;
  cardWidth: number;
  isMobile: boolean;
  onClick: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const imageSize = clamp(Math.round(cardWidth * 0.28), 72, 120);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(card.contractAddress);
    setCopied(true);
    toast.success("Contract address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const ZERO = "0x0000000000000000000000000000000000000000";

const handleClick = () => {
  if (isCentered) {
    const addr = (card.campaignAddress ?? "").toLowerCase();
    if (addr && addr !== ZERO) {
      navigate(`/token/${addr}`);
    }
    return;
  }

  // Otherwise just center the card
  onClick();
};


  return (
    <div
      className="relative transition-all duration-500 ease-out cursor-pointer"
      style={{
        transform: isCentered ? (isMobile ? "scale(1.06)" : "scale(1.22)") : "scale(1)",
        transformOrigin: "center",
        minWidth: `${cardWidth}px`,
        minHeight: `${cardWidth}px`,
        zIndex: isCentered ? 10 : 1,
        opacity: isMobile ? 1 : isCentered ? 1 : 0.85,
        willChange: "transform",
      }}
      onClick={handleClick}
    >
      <div
        className="relative"
        style={{
          height: `${cardWidth}px`,
          width: `${cardWidth}px`,
        }}
      >
        {/* Glow aligned to the exact card edge (same radius, no outer padding/border). */}
        <div className="relative h-full w-full rounded-2xl">
          <GlowingEffect
            spread={34}
            glow={false}
            disabled={false}
            proximity={72}
            inactiveZone={0.01}
            borderWidth={2}
          />
          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          {/* Top Section: Links and Stats */}
          <div className="flex items-start justify-between mb-3">
            {/* Social Links - Top Left */}
            <div className="flex gap-2">
              {card.links.website && (
                <a
                  href={card.links.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-lg border border-border bg-muted flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-colors"
                >
                  <Globe className="h-4 w-4" />
                </a>
              )}
              {card.links.twitter && (
                <a
                  href={card.links.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-lg border border-border bg-muted flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-colors"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              )}
            </div>

            {/* Holders and Volume - Top Right */}
            <div className="flex flex-col items-end gap-1 text-[11px] font-retro">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{card.holders}</span>
              </div>
              <div className="flex items-center gap-1 text-accent">
                <span>Vol {card.volume}</span>
              </div>
            </div>
          </div>

          {/* Center: Token Image */}
          <div className="flex-1 flex items-center justify-center mb-3">
            <div
              className="rounded-full overflow-hidden bg-muted border-2 border-border"
              style={{
                width: `${imageSize}px`,
                height: `${imageSize}px`,
              }}
            >
              <img src={card.image} alt={card.ticker} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Token Info */}
          <div className="flex flex-col items-center gap-2 mb-3">
            <h3 className="text-[clamp(18px,2.2vw,26px)] font-retro tracking-tight text-foreground">
              {card.ticker}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[clamp(11px,1.4vw,14px)] font-retro text-muted-foreground">
                {card.tokenName}
              </span>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="Copy contract address"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-accent" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            </div>
            <p className="text-[10px] font-retro text-muted-foreground text-center leading-relaxed line-clamp-2">
              {card.description}
            </p>
          </div>

          {/* Bottom Right: Market Cap */}
          <div className="flex justify-end">
            <span className="text-[11px] font-retro text-accent">
              MC {card.marketCap}
            </span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Example;

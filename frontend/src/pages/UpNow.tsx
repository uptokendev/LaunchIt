/**
 * UpNow Page
 * Displays three categories of tokens based on their market cap stages
 */

import { useState } from "react";
import { Sparkles, TrendingUp, Target, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { inceptionTokens, higherTokens, migratedTokens } from "@/constants/mockData";
import { Token } from "@/types/token";

const TokenCard = ({ token }: { token: Token }) => {
  const navigate = useNavigate();
  
  return (
    <div 
      className="bg-card/40 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-border hover:border-accent/50 transition-all cursor-pointer"
      onClick={() => navigate(`/token/${token.ticker.toLowerCase()}`)}
    >
      <div className="flex items-start gap-3">
        <img
          src={token.image}
          alt={token.ticker}
          className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-border object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="font-retro text-foreground text-xs md:text-sm truncate">
                {token.ticker}
              </h3>
              <p className="font-retro text-muted-foreground text-xs truncate">
                {token.name}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-xs font-retro text-muted-foreground">
                <span>👥 {token.holders}</span>
              </div>
              <p className="text-xs font-retro text-accent mt-1">Vol {token.volume}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {token.hasWebsite && (
                <button 
                  className="w-6 h-6 rounded-md border border-border bg-muted flex items-center justify-center hover:border-accent transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {token.hasTwitter && (
                <button 
                  className="w-6 h-6 rounded-md border border-border bg-muted flex items-center justify-center hover:border-accent transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="h-3 w-3 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </button>
              )}
            </div>
            <p className="text-xs font-retro text-accent">MC {token.marketCap}</p>
          </div>
          
          <p className="text-[10px] font-retro text-muted-foreground mt-2">{token.timeAgo}</p>
        </div>
      </div>
    </div>
  );
};

const UpNow = () => {
  const [activeTab, setActiveTab] = useState<"up" | "higher" | "moon">("up");
  const isMobile = window.innerWidth < 768;

  const renderSection = (type: "up" | "higher" | "moon") => {
    const config = {
      up: {
        icon: Sparkles,
        title: "up?",
        tokens: inceptionTokens,
        subtitle: null
      },
      higher: {
        icon: TrendingUp,
        title: "higher",
        tokens: higherTokens,
        subtitle: "Below $60k"
      },
      moon: {
        icon: Target,
        title: "to the moon",
        tokens: migratedTokens,
        subtitle: "Above $60k"
      }
    }[type];

    const Icon = config.icon;

    return (
      <div className="bg-card/30 backdrop-blur-md rounded-2xl border border-border flex flex-col overflow-hidden h-full">
        <div className="flex items-center justify-between p-4 md:p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-accent/20 p-2 md:p-3 rounded-xl">
              <Icon className="h-5 w-5 md:h-6 md:w-6 text-accent" />
            </div>
            <h2 className="text-xl md:text-2xl font-retro text-foreground">{config.title}</h2>
          </div>
          {config.subtitle && (
            <span className="text-xs md:text-sm font-retro text-muted-foreground">{config.subtitle}</span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 md:pb-6 space-y-3 scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
          {config.tokens.length > 0 ? (
            config.tokens.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="font-retro text-muted-foreground text-sm">No tokens found</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 pt-28 lg:pt-28 pl-0 lg:pl-72">
      <div className={`h-full ${isMobile ? 'pb-20' : ''} p-4 md:p-6 ${isMobile ? 'flex flex-col' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
        {/* Mobile: Show only active tab, Desktop: Show all sections */}
        {isMobile ? (
          renderSection(activeTab)
        ) : (
          <>
            {/* Section 1: up? (Inception) */}
            {renderSection("up")}

            {/* Section 2: higher (Close to bonding) */}
            {renderSection("higher")}

            {/* Section 3: UP only (Migrated) */}
            <div className="md:col-span-2 lg:col-span-1">
              {renderSection("moon")}
            </div>
          </>
        )}
      </div>

      {/* Mobile Bottom Tab Menu */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-2 flex justify-around items-center z-50">
          <button
            onClick={() => setActiveTab("up")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
              activeTab === "up" ? "bg-accent/20 text-accent" : "text-muted-foreground"
            }`}
          >
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-retro">up?</span>
          </button>
          <button
            onClick={() => setActiveTab("higher")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
              activeTab === "higher" ? "bg-accent/20 text-accent" : "text-muted-foreground"
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            <span className="text-xs font-retro">higher</span>
          </button>
          <button
            onClick={() => setActiveTab("moon")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all ${
              activeTab === "moon" ? "bg-accent/20 text-accent" : "text-muted-foreground"
            }`}
          >
            <Target className="h-5 w-5" />
            <span className="text-xs font-retro">to the moon</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UpNow;

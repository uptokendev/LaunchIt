import { Card, CardContent } from "@/components/ui/card";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { trendingTokens } from "@/constants/mockData";

export const TrendingSection = () => {
  return (
    <div className="mb-12">
      <h2 className="text-2xl font-retro text-accent mb-6" style={{ textShadow: '0 0 10px hsl(var(--glow-accent))' }}>
        Trending Now
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {trendingTokens.map((token) => (
          <div key={token.rank} className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={3}
            />
            <Card className="relative bg-card/50 backdrop-blur-sm border-accent/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <span className="text-3xl font-retro text-accent/50">#{token.rank}</span>
                  <span className="text-xs font-retro text-accent">{token.change}</span>
                </div>
                <h3 className="text-lg font-retro text-accent mb-2" style={{ textShadow: '0 0 5px hsl(var(--glow-accent))' }}>
                  {token.name}
                </h3>
                <p className="text-2xl font-retro text-foreground">{token.value}</p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};

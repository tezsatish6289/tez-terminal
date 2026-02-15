
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, MoreHorizontal, MousePointer2, Plus, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ChartPaneProps {
  symbol?: string;
  interval?: string;
  exchange?: string;
}

export function ChartPane({ symbol = "BTCUSDT", interval = "15", exchange = "BINANCE" }: ChartPaneProps) {
  const container = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clean symbol to ensure TradingView compatibility (e.g., BINANCE:BTCUSDT)
  const formattedSymbol = symbol.includes(":") ? symbol : `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
  
  // Map intervals if they are coming as numbers but need to be strings for TV
  const tvInterval = interval === "0" ? "1" : interval;

  return (
    <Card className="flex-1 bg-[#13111a] border-border overflow-hidden relative group rounded-xl min-h-[500px] h-[60vh]">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-md p-1.5 rounded-lg border border-border">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-accent font-bold">{formattedSymbol}</Button>
        <span className="text-muted-foreground text-xs">{tvInterval}m</span>
      </div>
      
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-md p-1.5 rounded-lg border border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7"><Maximize2 className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
      </div>

      <div className="w-full h-full bg-[#13111a] relative">
        {mounted ? (
          <iframe
            key={`${formattedSymbol}-${tvInterval}`}
            src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_762c4&symbol=${formattedSymbol}&interval=${tvInterval}&hidesidetoolbar=1&hidetoptoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc/UTC&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en`}
            className="w-full h-full border-none"
            allowFullScreen
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
             <div className="bg-accent/10 p-4 rounded-full border border-accent/20 animate-pulse-cyan">
                <Zap className="h-8 w-8 text-accent" />
             </div>
             <p className="text-muted-foreground text-sm animate-pulse">Initializing Terminal Bridge...</p>
          </div>
        )}
      </div>
    </Card>
  );
}

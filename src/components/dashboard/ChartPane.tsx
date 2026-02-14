
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, MoreHorizontal, MousePointer2, Plus } from "lucide-react";
import Image from "next/image";

export function ChartPane() {
  return (
    <Card className="flex-1 bg-[#13111a] border-border overflow-hidden relative group rounded-xl">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-md p-1.5 rounded-lg border border-border">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-accent font-bold">BTC/USDT</Button>
        <span className="text-muted-foreground text-xs">15m</span>
        <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-4 w-4" /></Button>
      </div>
      
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-md p-1.5 rounded-lg border border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7"><MousePointer2 className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7"><Maximize2 className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
      </div>

      <div className="w-full h-full min-h-[400px] flex items-center justify-center relative bg-[#13111a]">
        <Image 
          src="https://picsum.photos/seed/tradingchart/1200/800" 
          alt="Trading Chart" 
          fill 
          className="object-cover opacity-60 mix-blend-screen"
          data-ai-hint="trading chart"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
        
        {/* Mock Indicators Layer */}
        <div className="absolute inset-0 flex items-center justify-center opacity-40 pointer-events-none">
           <svg className="w-full h-full" viewBox="0 0 800 400">
             <path d="M0,200 Q100,150 200,220 T400,180 T600,250 T800,200" fill="none" stroke="#7DF9FF" strokeWidth="2" />
             <path d="M0,250 Q100,200 200,270 T400,230 T600,300 T800,250" fill="none" stroke="#38304A" strokeWidth="2" strokeDasharray="4 4" />
           </svg>
        </div>

        <div className="z-20 text-center">
          <div className="bg-accent/10 p-4 rounded-full border border-accent/20 animate-pulse-cyan inline-block mb-4">
            <Zap className="h-8 w-8 text-accent" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Live TradingView Integration</h3>
          <p className="text-muted-foreground text-sm max-w-xs">Connecting to real-time Webhook Stream...</p>
        </div>
      </div>
    </Card>
  );
}

import { Zap } from "lucide-react";

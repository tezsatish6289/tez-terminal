"use client";

import { useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { TopBar } from "@/components/dashboard/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  ChevronLeft, 
  ArrowUpRight, 
  ArrowDownRight, 
  BarChart3, 
  Zap,
  Loader2,
  AlertTriangle,
  Timer,
  TrendingUp,
  BrainCircuit,
  ShieldCheck,
  Target,
  Info,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInMinutes } from "date-fns";
import { useEffect, useState } from "react";
import { analyzeSignal, type AnalyzeSignalOutput } from "@/ai/flows/analyze-signal-flow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function DeepDiveChartPage() {
  const { id } = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  
  // AI States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeSignalOutput | null>(null);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const signalRef = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return doc(firestore, "signals", id as string);
  }, [firestore, id]);

  const { data: signal, isLoading: isSignalLoading, error } = useDoc(signalRef);

  const handleAIAnalysis = async () => {
    if (!signal) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeSignal({
        symbol: signal.symbol,
        type: signal.type,
        entryPrice: Number(signal.price),
        currentPrice: Number(signal.currentPrice || signal.price),
        timeframe: signal.timeframe,
        maxUpside: Number(calculatePercent(signal.maxUpsidePrice, signal.price, signal.type)),
        maxDrawdown: Number(calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type)),
        assetType: signal.assetType,
        exchange: signal.exchange
      });
      setAnalysis(result);
    } catch (err) {
      console.error("AI Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getDisplayAssetType = (signal: any) => {
    if (!signal) return "UNCLASSIFIED";
    if (signal.assetType && signal.assetType !== "UNCLASSIFIED") return signal.assetType;
    try {
      const payload = typeof signal.payload === 'string' ? JSON.parse(signal.payload) : (signal.payload || {});
      const raw = payload.assetType || payload.asset_type || payload.category || payload.market_type || payload.type_asset;
      if (raw) return raw.toString().toUpperCase();
    } catch (e) {}
    return "UNCLASSIFIED";
  };

  const calculatePercent = (targetPrice: number | undefined | null, entry: any, type: string) => {
    const entryNum = Number(entry);
    if (targetPrice === undefined || targetPrice === null || !entryNum || entryNum === 0) return "0.00";
    const diff = type === 'BUY' ? targetPrice - entryNum : entryNum - targetPrice;
    return ((diff / entryNum) * 100).toFixed(2);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return "--";
    const decimals = price < 1 ? 6 : 2;
    return price.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  if (isUserLoading || (isSignalLoading && !signal)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    );
  }

  if (error || (!signal && !isSignalLoading)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center gap-6">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Signal Not Found</h2>
        <Button onClick={() => router.push("/")} variant="outline">Return to Terminal</Button>
      </div>
    );
  }

  const alertPrice = Number(signal?.price || 0);
  const currentPrice = Number(signal?.currentPrice || 0);
  const livePnl = calculatePercent(currentPrice, alertPrice, signal?.type || "BUY");

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-foreground overflow-hidden">
      <TopBar />
      
      <ScrollArea className="w-full bg-card/95 border-b border-white/10 shrink-0 backdrop-blur-xl z-20 shadow-2xl">
        <div className="h-24 flex items-center px-6 justify-between min-w-max gap-12">
          <div className="flex items-center gap-8">
            <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="hover:bg-accent/10 text-muted-foreground">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div className="flex items-center gap-4">
               <div className="bg-primary/30 p-2.5 rounded-xl border border-accent/20">
                  <BarChart3 className="h-6 w-6 text-accent" />
               </div>
               <div>
                  <h2 className="text-2xl font-black text-white leading-none uppercase">{signal?.symbol}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                     <Badge variant="outline" className="text-[9px] h-4 border-white/10 uppercase font-black opacity-60">
                       {getDisplayAssetType(signal)}
                     </Badge>
                     <Badge className={cn("text-[9px] h-4 font-bold border-none", signal?.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                       {signal?.type}
                     </Badge>
                  </div>
               </div>
            </div>
            <div className="flex flex-col justify-center gap-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Entry Price</span>
              <span className="text-xl font-mono font-bold text-white/90 leading-none">${formatPrice(alertPrice)}</span>
            </div>
          </div>

          <div className="flex items-center gap-12">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-[10px] uppercase font-bold text-accent tracking-widest">Latest Live</span>
              <span className={cn("text-xl font-mono font-black leading-none", Number(livePnl) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                ${formatPrice(currentPrice)}
              </span>
              <span className={cn("text-[10px] font-mono font-black flex items-center gap-1", Number(livePnl) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                <TrendingUp className={cn("h-3 w-3", Number(livePnl) < 0 && "rotate-180")} />
                {livePnl}% PNL
              </span>
            </div>

            <Button 
              onClick={handleAIAnalysis} 
              disabled={isAnalyzing}
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 h-11 px-6 font-bold shadow-[0_0_20px_rgba(125,249,255,0.2)]"
            >
              {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <BrainCircuit className="h-5 w-5" />}
              Gemini AI Insight
            </Button>
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-[#13111a]">
          <ChartPane 
            symbol={signal?.symbol} 
            interval={signal?.timeframe} 
            exchange={signal?.exchange}
          />
        </div>

        {/* AI INSIGHT SIDEBAR */}
        <aside className={cn(
          "w-80 border-l border-white/5 bg-[#0a0a0c] flex flex-col transition-all duration-500",
          (!analysis && !isAnalyzing) ? "translate-x-full opacity-0 w-0" : "translate-x-0 opacity-100"
        )}>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-accent" />
                  <h3 className="font-bold text-sm uppercase tracking-widest text-white">AI Co-Pilot</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setAnalysis(null)} className="h-6 w-6 text-muted-foreground">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {isAnalyzing ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
                   <div className="relative">
                     <BrainCircuit className="h-12 w-12 text-accent animate-pulse" />
                     <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full animate-pulse" />
                   </div>
                   <p className="text-xs font-bold text-muted-foreground uppercase animate-pulse">Scanning technical metrics...</p>
                </div>
              ) : analysis && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2 block">Recommendation</span>
                    <div className="text-2xl font-black text-white uppercase leading-tight mb-3">
                      {analysis.recommendation}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
                        <span>Confidence Score</span>
                        <span>{analysis.confidenceScore}%</span>
                      </div>
                      <Progress value={analysis.confidenceScore} className="h-1 bg-white/5" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <Info className="h-3.5 w-3.5 text-accent" />
                        Reasoning
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed font-medium bg-white/5 p-3 rounded-lg border border-white/5">
                        {analysis.technicalReasoning}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                        Risk Assessment
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed font-medium bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
                        {analysis.riskAssessment}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
                       <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-rose-400 uppercase mb-1">
                             <Target className="h-3 w-3" /> Stop Loss
                          </div>
                          <div className="text-sm font-mono font-bold text-white">${formatPrice(analysis.suggestedStopLoss)}</div>
                       </div>
                       <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 uppercase mb-1">
                             <TrendingUp className="h-3 w-3" /> Target
                          </div>
                          <div className="text-sm font-mono font-bold text-white">${formatPrice(analysis.suggestedTakeProfit)}</div>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

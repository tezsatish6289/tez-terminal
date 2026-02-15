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
  BarChart3, 
  Loader2,
  AlertTriangle,
  Timer,
  TrendingUp,
  BrainCircuit,
  ShieldCheck,
  Target,
  Info,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { analyzeSignal, type AnalyzeSignalOutput } from "@/ai/flows/analyze-signal-flow";
import { Progress } from "@/components/ui/progress";
import { format, differenceInMinutes } from "date-fns";
import { useToast } from "@/hooks/use-toast";

/**
 * Deep Dive Analysis Page.
 * Focus: Centralized TradingView CTA and AI Technical Insights.
 */
export default function DeepDiveChartPage() {
  const { id } = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  
  // AI States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeSignalOutput | null>(null);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const signalRef = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return doc(firestore, "signals", id as string);
  }, [firestore, id]);

  const { data: signal, isLoading: isSignalLoading, error } = useDoc(signalRef);

  const calculatePercent = (target: any, entry: any, type: string) => {
    const e = Number(entry);
    const t = Number(target);
    if (!e || isNaN(t)) return "0.00";
    const diff = type === 'BUY' ? t - e : e - t;
    return ((diff / e) * 100).toFixed(2);
  };

  const handleAIAnalysis = async () => {
    if (!signal) return;
    setIsAnalyzing(true);
    setAnalysis(null);
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
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Analysis Offline", description: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return "--";
    const decimals = p < 1 ? 6 : 2;
    return p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  if (isUserLoading || (isSignalLoading && !signal)) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-10 w-10 animate-spin text-accent" /></div>;
  }

  if (error || (!signal && !isSignalLoading)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 gap-6">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Signal Not Found</h2>
        <Button onClick={() => router.push("/")} variant="outline">Return to Terminal</Button>
      </div>
    );
  }

  const livePnl = calculatePercent(signal?.currentPrice, signal?.price, signal?.type || "BUY");
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${signal?.exchange || 'BINANCE'}:${signal?.symbol}&interval=${signal?.timeframe || '15'}`;

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-foreground overflow-hidden">
      <TopBar />
      
      {/* Dynamic Header Strip */}
      <ScrollArea className="w-full bg-[#0a0a0c] border-b border-white/5 shrink-0 z-20">
        <div className="h-24 flex items-center px-6 justify-between min-w-[1200px] gap-8">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-muted-foreground"><ChevronLeft className="h-6 w-6" /></Button>
            <div className="flex items-center gap-4">
               <div className="bg-primary/20 p-2 rounded-xl border border-white/5"><BarChart3 className="h-6 w-6 text-accent" /></div>
               <div>
                  <h2 className="text-2xl font-black text-white leading-none uppercase tracking-tighter">{signal?.symbol}</h2>
                  <div className="flex items-center gap-2 mt-2">
                     <Badge className={cn("text-[9px] h-4 font-bold px-1.5", signal?.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                        {signal?.type === 'BUY' ? 'BULLISH' : 'BEARISH'}
                     </Badge>
                     <div className="text-[10px] font-bold text-muted-foreground/60"><Timer className="h-3 w-3 inline mr-1" /> {differenceInMinutes(now, new Date(signal?.receivedAt))}m</div>
                  </div>
               </div>
            </div>
          </div>

          <div className="flex items-center gap-12 flex-1 justify-center">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Entry</span>
              <span className="text-xl font-mono font-bold text-white">${formatPrice(signal?.price)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-accent">Latest Live</span>
              <span className={cn("text-xl font-mono font-black", Number(livePnl) >= 0 ? "text-emerald-400" : "text-rose-400")}>${formatPrice(signal?.currentPrice)}</span>
              <span className={cn("text-[10px] font-mono font-black", Number(livePnl) >= 0 ? "text-emerald-400" : "text-rose-400")}>{livePnl}% PNL</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 h-6 px-3"><Zap className="h-3 w-3 mr-2 animate-pulse fill-emerald-400" /> LIVE NODE</Badge>
            <Button onClick={handleAIAnalysis} disabled={isAnalyzing} className="bg-accent text-accent-foreground font-bold h-11 px-6">
              {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <BrainCircuit className="h-5 w-5 mr-2" />} Gemini AI Insight
            </Button>
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Chart Viewport */}
        <div className="flex-1 relative bg-[#13111a] flex flex-col">
          <div className="flex-1 min-h-0">
            <ChartPane symbol={signal?.symbol} interval={signal?.timeframe} exchange={signal?.exchange} />
          </div>
          {/* Centrally Aligned Slim CTA */}
          <div className="py-3 flex items-center justify-center bg-[#0a0a0c] border-t border-white/5">
            <Button asChild variant="outline" size="sm" className="border-accent/30 text-accent hover:bg-accent/10 font-bold uppercase tracking-tight h-8 px-6 rounded-lg">
              <a href={tradingViewUrl} target="_blank" rel="noopener noreferrer">View In Tradingview <ExternalLink className="ml-2 h-3.5 w-3.5" /></a>
            </Button>
          </div>
        </div>

        {/* AI Sidebar */}
        <aside className={cn("w-80 border-l border-white/5 bg-[#0a0a0c] flex flex-col transition-all duration-500", !analysis && !isAnalyzing ? "translate-x-full opacity-0 w-0" : "translate-x-0 opacity-100")}>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-accent" /><h3 className="font-bold text-sm uppercase text-white">AI Analysis</h3></div>
                <Button variant="ghost" size="icon" onClick={() => setAnalysis(null)} className="h-6 w-6"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              {isAnalyzing ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
                   <BrainCircuit className="h-12 w-12 text-accent animate-pulse" />
                   <p className="text-xs font-bold text-muted-foreground uppercase animate-pulse">Scanning Technicals...</p>
                </div>
              ) : (analysis && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                    <span className="text-[10px] font-bold text-accent uppercase mb-2 block">RECOMMENDATION</span>
                    <div className="text-2xl font-black text-white uppercase">{analysis.recommendation}</div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase"><Info className="h-3.5 w-3.5" />Technical Rationale</div>
                      <p className="text-xs text-white/70 leading-relaxed font-medium bg-white/5 p-3 rounded-lg">{analysis.technicalReasoning}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Risk Audit</div>
                      <p className="text-xs text-white/70 leading-relaxed font-medium bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">{analysis.riskAssessment}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
                       <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                          <div className="text-[9px] font-black text-rose-400 uppercase mb-1">Stop Loss</div>
                          <div className="text-sm font-mono font-bold text-white">${formatPrice(analysis.suggestedStopLoss)}</div>
                       </div>
                       <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                          <div className="text-[9px] font-black text-emerald-400 uppercase mb-1">Take Profit</div>
                          <div className="text-sm font-mono font-bold text-white">${formatPrice(analysis.suggestedTakeProfit)}</div>
                       </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

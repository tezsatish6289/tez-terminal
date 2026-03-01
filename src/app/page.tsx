"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { LandingPage } from "@/components/landing/LandingPage";
import { useUser, useAuth, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Zap, Loader2, Chrome, TrendingUp, TrendingDown, Shield, Trophy, Crown } from "lucide-react";
import { useTradeAlerts } from "@/hooks/use-trade-alerts";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getLeverage, getLeverageLabel } from "@/lib/leverage";
import { computeSentiment, type SignalForSentiment } from "@/lib/sentiment";

const OPPORTUNITY_CATEGORIES = [
  { id: "5", name: "Scalping", chart: "5 min", windowHours: 24, windowLabel: "in 24h", leverage: "10x" },
  { id: "15", name: "Intraday", chart: "15 min", windowHours: 48, windowLabel: "in 48h", leverage: "5x" },
  { id: "60", name: "BTST", chart: "1 hr", windowHours: 168, windowLabel: "in 7d", leverage: "3x" },
  { id: "240", name: "Swing", chart: "4 hr", windowHours: 720, windowLabel: "in 30d", leverage: "3x" },
  { id: "D", name: "Buy and hold", chart: "Daily", windowHours: 2160, windowLabel: "in 90d", leverage: "1x" },
] as const;

type StatusKey = "working" | "not-working" | "neutral";
type SideKey = "BUY" | "SELL";

function getPnlStatus(pnl: number): StatusKey {
  if (pnl > 0.05) return "working";
  if (pnl < -0.05) return "not-working";
  return "neutral";
}

function getDisplayAssetType(signal: { assetType?: string }) {
  if (signal.assetType && signal.assetType !== "UNCLASSIFIED") return signal.assetType;
  return "CRYPTO";
}

function calculatePercent(currentPrice: number | undefined | null, entry: number, type: string): number {
  if (currentPrice == null || !entry || entry === 0) return 0;
  const diff = type === "BUY" ? currentPrice - entry : entry - currentPrice;
  return (diff / entry) * 100;
}

function hit2xTarget(signal: { price: number; stopLoss: number | null; maxUpsidePrice: number | null; type: string }): boolean {
  if (!signal.stopLoss || !signal.maxUpsidePrice) return false;
  const risk = Math.abs(signal.price - signal.stopLoss);
  if (risk === 0) return false;
  const target = signal.type === "BUY" ? signal.price + 2 * risk : signal.price - 2 * risk;
  return signal.type === "BUY" ? signal.maxUpsidePrice >= target : signal.maxUpsidePrice <= target;
}

function effectivePnl(signal: { price: number; stopLoss: number | null; maxUpsidePrice: number | null; currentPrice: number | null; type: string }): number {
  const raw = calculatePercent(signal.currentPrice, signal.price, signal.type);
  if (raw >= 0) return raw;
  if (hit2xTarget(signal)) return 0;
  return raw;
}


interface WinnerSignal {
  symbol: string;
  pnl: number;
  maxPnl: number;
  type: string;
  price: number;
  currentPrice: number | null;
  maxUpsidePrice: number | null;
  maxDrawdownPrice: number | null;
  stopLoss: number | null;
  receivedAt: string;
  timeframe: string;
}

function formatNarrationPrice(price: number | null | undefined): string {
  if (price == null) return "--";
  const decimals = price < 1 ? 6 : 2;
  return price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function TradeNarrationDialog({ signal, open, onClose }: { signal: WinnerSignal | null; open: boolean; onClose: () => void }) {
  if (!signal) return null;

  const leverage = getLeverage(signal.timeframe);
  const isBullish = signal.type === "BUY";
  const direction = isBullish ? "bullish" : "bearish";
  const directionLabel = isBullish ? "LONG" : "SHORT";
  const maxUpPnl = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type);
  const maxDownPnl = calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type);
  const leveragedPnl = signal.pnl * leverage;
  const slDistance = signal.stopLoss ? calculatePercent(signal.stopLoss, signal.price, signal.type) : null;

  const hasMaxUpside = signal.maxUpsidePrice != null && signal.maxUpsidePrice > 0;
  const hasMaxDrawdown = signal.maxDrawdownPrice != null && signal.maxDrawdownPrice > 0;
  const hasStopLoss = signal.stopLoss != null && signal.stopLoss > 0;

  let entryDate = "";
  try { entryDate = format(new Date(signal.receivedAt), "MMM dd, h:mm a"); } catch { entryDate = "—"; }

  const slWasThreatened = hasStopLoss && hasMaxDrawdown && (
    isBullish
      ? signal.maxDrawdownPrice! <= signal.stopLoss!
      : signal.maxDrawdownPrice! >= signal.stopLoss!
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl bg-card border-white/10 p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{signal.symbol} Trade Details</DialogTitle>
          <DialogDescription>Detailed narration of the {signal.symbol} trade</DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 divide-x divide-white/5">
          {/* Left: Signal Card */}
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">{signal.symbol}</h3>
                <span className={cn("text-[10px] font-black uppercase tracking-widest", isBullish ? "text-positive" : "text-negative")}>
                  {directionLabel}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className={cn("px-3 py-1 rounded-lg text-xs font-black uppercase", isBullish ? "bg-positive/20 text-positive" : "bg-negative/20 text-negative")}>
                  {isBullish ? "Bullish" : "Bearish"}
                </div>
                <div className="px-3 py-1 rounded-lg text-xs font-black uppercase bg-accent/15 text-accent">
                  {leverage}x
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entry Price</p>
                <p className="text-lg font-mono font-bold">${formatNarrationPrice(signal.price)}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] font-bold text-accent uppercase tracking-widest">Current Price</p>
                <p className={cn("text-lg font-mono font-black", signal.pnl >= 0 ? "text-positive" : "text-negative")}>
                  ${formatNarrationPrice(signal.currentPrice)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-3 space-y-3">
              <span className="text-[9px] uppercase font-black tracking-widest text-accent block text-center">Returns at {leverage}x Leverage</span>
              <div className="rounded-lg border bg-white/5 border-white/10 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Live PNL</span>
                <span className={cn("text-xl font-mono font-black", leveragedPnl >= 0 ? "text-positive" : "text-negative")}>
                  {leveragedPnl >= 0 ? "+" : ""}{leveragedPnl.toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-positive/10 border border-positive/20">
                  <span className="text-[9px] uppercase font-black text-positive/90 tracking-widest">Peak Upside</span>
                  <span className="text-base font-mono font-black text-positive">
                    {hasMaxUpside ? `+${(maxUpPnl * leverage).toFixed(2)}%` : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-negative/10 border border-negative/20">
                  <span className="text-[9px] uppercase font-black text-negative/90 tracking-widest">Max Drawdown</span>
                  <span className="text-base font-mono font-black text-negative">
                    {hasMaxDrawdown ? `${(maxDownPnl * leverage).toFixed(2)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>

            {hasStopLoss && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Stop Loss</span>
                <span className="ml-auto font-mono text-sm font-bold">${formatNarrationPrice(signal.stopLoss)}</span>
              </div>
            )}
          </div>

          {/* Right: Narration */}
          <div className="p-6 space-y-5 bg-white/[0.01]">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Trade Narration</h4>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">1</div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">The Call</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                  TezTerminal identified a <span className="font-bold text-foreground">{direction}</span> opportunity on{" "}
                  <span className="font-bold text-foreground">{signal.symbol}</span> at{" "}
                  <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.price)}</span> on{" "}
                  <span className="font-bold text-foreground">{entryDate}</span>.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">2</div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">The Journey</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                  {hasMaxUpside ? (
                    <>Since entry, price surged to a peak of <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.maxUpsidePrice)}</span>{" "}
                    (<span className="font-mono font-bold text-foreground">+{maxUpPnl.toFixed(2)}%</span> max favorable excursion)</>
                  ) : (
                    <>Peak upside data is still being tracked</>
                  )}
                  {hasMaxDrawdown ? (
                    <>, while the deepest pullback was to <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.maxDrawdownPrice)}</span>{" "}
                    (<span className="font-mono font-bold text-foreground">{maxDownPnl.toFixed(2)}%</span>).</>
                  ) : (
                    <>. Drawdown data is still being tracked.</>
                  )}
                </p>
              </div>

              {hasStopLoss && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">3</div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">Risk Discipline</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                    Stop loss was set at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.stopLoss)}</span>{" "}
                    (<span className="font-mono font-bold text-foreground">{slDistance?.toFixed(2)}%</span> from entry).{" "}
                    <span className="font-bold text-foreground">{slWasThreatened ? "The stop zone was tested during the trade." : "It was never threatened."}</span>
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">{hasStopLoss ? "4" : "3"}</div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">The Result</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                  Currently trading at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.currentPrice)}</span>, delivering{" "}
                  <span className={cn("font-mono font-black text-base", leveragedPnl >= 0 ? "text-positive" : "text-negative")}>
                    {leveragedPnl >= 0 ? "+" : ""}{leveragedPnl.toFixed(2)}%
                  </span>{" "}returns at <span className="font-bold text-accent">{leverage}x</span> leverage.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WinnersTicker({ winners, windowLabel, leverage, onSelect }: { winners: WinnerSignal[]; windowLabel: string; leverage: number; onSelect: (w: WinnerSignal) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (winners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % winners.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [winners.length]);

  if (winners.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.03]">
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-amber-500/5">
          <Trophy className="h-3.5 w-3.5 text-amber-500/40" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Top Winning Trades</span>
            <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">{windowLabel}</span>
          </div>
        </div>
        <div className="px-4 py-2.5 text-center">
          <span className="text-[10px] text-muted-foreground/30 uppercase tracking-wider">No winners yet</span>
        </div>
      </div>
    );
  }

  const winner = winners[activeIndex];
  return (
    <div className="rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.08] to-amber-600/[0.03] shadow-[0_0_15px_-3px_rgba(245,158,11,0.1)]">
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-amber-500/10">
        <Trophy className="h-3.5 w-3.5 text-amber-400" />
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Top Winning Trades</span>
          <span className="text-[9px] text-amber-400/50 uppercase tracking-wider">{windowLabel}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.preventDefault(); onSelect(winner); }}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-500/[0.05] transition-colors cursor-pointer"
      >
        <span className="text-xs font-bold text-foreground uppercase tracking-wider truncate">{winner.symbol}</span>
        <span className="text-base font-black font-mono text-amber-400 animate-pulse">+{(winner.maxPnl * leverage).toFixed(2)}%</span>
      </button>
    </div>
  );
}

const TAGLINES = [
  "Scanning the cryptoverse.",
  "Filtering the noise.",
  "Dropping high-probability setups.",
];

function TypewriterTagline() {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "hold" | "fading">("typing");
  const [opacity, setOpacity] = useState(1);

  const line = TAGLINES[lineIndex];

  useEffect(() => {
    if (phase === "typing") {
      if (charIndex < line.length) {
        const timeout = setTimeout(() => setCharIndex((c) => c + 1), 45);
        return () => clearTimeout(timeout);
      }
      setPhase("hold");
    } else if (phase === "hold") {
      const timeout = setTimeout(() => setPhase("fading"), 1800);
      return () => clearTimeout(timeout);
    } else if (phase === "fading") {
      setOpacity(0);
      const timeout = setTimeout(() => {
        setLineIndex((i) => (i + 1) % TAGLINES.length);
        setCharIndex(0);
        setOpacity(1);
        setPhase("typing");
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [phase, charIndex, line.length]);

  return (
    <p
      className="text-sm text-muted-foreground mt-1 h-6 font-mono transition-opacity duration-500"
      style={{ opacity }}
    >
      {line.slice(0, charIndex)}
      <span className="inline-block w-[2px] h-[14px] bg-accent/70 ml-0.5 align-middle animate-[pulse_0.8s_ease-in-out_infinite]" />
    </p>
  );
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function FreshnessDot() {
  const [pinging, setPinging] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setPinging(false), 2000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pinging && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />}
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent shadow-[0_0_6px_theme(colors.accent)]" />
    </span>
  );
}

function OpportunityCard({ cat, activeCounts, signalIds, sentimentByTimeframe, topWinners, onSelectWinner, freshSignal, premiumMode }: {
  cat: typeof OPPORTUNITY_CATEGORIES[number];
  activeCounts: Record<string, Record<SideKey, Record<StatusKey, number>>>;
  signalIds: Record<string, Record<SideKey, Record<StatusKey, string[]>>>;
  sentimentByTimeframe: Record<string, ReturnType<typeof computeSentiment>>;
  topWinners: Record<string, WinnerSignal[]>;
  onSelectWinner: (w: WinnerSignal) => void;
  freshSignal?: { id: string; ticker: string; type: string; receivedAt: string } | null;
  premiumMode?: boolean;
}) {
  const c = activeCounts[cat.id] ?? { BUY: { working: 0, "not-working": 0, neutral: 0 }, SELL: { working: 0, "not-working": 0, neutral: 0 } };
  const ids = signalIds[cat.id] ?? { BUY: { working: [], "not-working": [], neutral: [] }, SELL: { working: [], "not-working": [], neutral: [] } };
  const sentiment = sentimentByTimeframe[cat.id] ?? { label: "No clear trend", color: "text-muted-foreground" };
  const alignedParam = premiumMode ? "&aligned=true" : "";
  const boxHref = (side: SideKey, status: StatusKey) => {
    const arr = ids[side][status];
    if (arr.length === 1) return `/chart/${arr[0]}`;
    return `/terminal?timeframe=${cat.id}&side=${side}&status=${status}${alignedParam}`;
  };
  return (
    <Card className="bg-[#121214] border-white/5 shadow-2xl overflow-hidden rounded-2xl">
      <div className="p-6 border-b border-white/5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl font-black uppercase tracking-tighter">{cat.name}</CardTitle>
              {freshSignal && <FreshnessDot />}
            </div>
            <CardDescription className="text-[10px] font-black uppercase text-accent tracking-widest">{cat.chart} chart</CardDescription>
            {freshSignal && (
              <Link href={`/chart/${freshSignal.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent hover:bg-accent/20 transition-colors">
                <span className={freshSignal.type === "BUY" ? "text-positive" : "text-negative"}>{freshSignal.type === "BUY" ? "▲" : "▼"}</span>
                <span>{freshSignal.ticker}</span>
                <span className="text-accent/50">·</span>
                <span className="text-accent/70">{formatTimeAgo(freshSignal.receivedAt)}</span>
              </Link>
            )}
          </div>
          <Badge className="text-[10px] font-black border-none px-3 h-7 uppercase bg-accent/15 text-accent">
            {cat.leverage}
          </Badge>
        </div>
      </div>
      <CardContent className="p-6 space-y-5">
        <WinnersTicker winners={topWinners[cat.id] ?? []} windowLabel={cat.windowLabel} leverage={getLeverage(cat.id)} onSelect={onSelectWinner} />
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-positive" />
            <span className="text-[10px] font-black uppercase tracking-wider text-positive">Bulls</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Link href={boxHref("BUY", "working")} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-positive/10 border-positive/20 hover:bg-positive/20")}>
              <div className="text-lg font-black font-mono text-positive">{c.BUY.working}</div>
              <div className="text-[9px] font-bold uppercase text-positive/80">Winning</div>
            </Link>
            <Link href={boxHref("BUY", "not-working")} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-negative/10 border-negative/20 hover:bg-negative/20")}>
              <div className="text-lg font-black font-mono text-negative">{c.BUY["not-working"]}</div>
              <div className="text-[9px] font-bold uppercase text-negative/80">Losing</div>
            </Link>
            <Link href={boxHref("BUY", "neutral")} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center hover:bg-white/10 transition-colors">
              <div className="text-lg font-black font-mono text-foreground">{c.BUY.neutral}</div>
              <div className="text-[9px] font-bold uppercase text-muted-foreground">Neutral</div>
            </Link>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-negative" />
            <span className="text-[10px] font-black uppercase tracking-wider text-negative">Bears</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Link href={boxHref("SELL", "working")} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-positive/10 border-positive/20 hover:bg-positive/20")}>
              <div className="text-lg font-black font-mono text-positive">{c.SELL.working}</div>
              <div className="text-[9px] font-bold uppercase text-positive/80">Winning</div>
            </Link>
            <Link href={boxHref("SELL", "not-working")} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-negative/10 border-negative/20 hover:bg-negative/20")}>
              <div className="text-lg font-black font-mono text-negative">{c.SELL["not-working"]}</div>
              <div className="text-[9px] font-bold uppercase text-negative/80">Losing</div>
            </Link>
            <Link href={boxHref("SELL", "neutral")} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center hover:bg-white/10 transition-colors">
              <div className="text-lg font-black font-mono text-foreground">{c.SELL.neutral}</div>
              <div className="text-[9px] font-bold uppercase text-muted-foreground">Neutral</div>
            </Link>
          </div>
        </div>
      </CardContent>
      <div className="px-6 py-3 bg-black/40 border-t border-white/5 text-center">
        <span className={cn("text-[10px] font-black uppercase tracking-widest", sentiment.color)}>{sentiment.label}</span>
      </div>
    </Card>
  );
}

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<WinnerSignal | null>(null);
  const [premiumMode, setPremiumModeRaw] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("tez_premium_mode") === "true";
    return false;
  });
  const setPremiumMode = useCallback((v: boolean) => {
    setPremiumModeRaw(v);
    localStorage.setItem("tez_premium_mode", String(v));
  }, []);
  const [selectedTimeframe, setSelectedTimeframe] = useState(OPPORTUNITY_CATEGORIES[0].id);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingFromChip = useRef(false);

  const handleChipClick = useCallback((id: string) => {
    setSelectedTimeframe(id);
    const el = cardRefs.current[id];
    if (el) {
      isScrollingFromChip.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => { isScrollingFromChip.current = false; }, 800);
    }
  }, []);

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "signals"), orderBy("receivedAt", "desc"), limit(200));
  }, [user, firestore]);

  const { data: rawSignals, isLoading } = useCollection(signalsQuery);

  useEffect(() => {
    if (isLoading) return;
    const entries = Object.entries(cardRefs.current).filter(([, el]) => el != null);
    if (entries.length === 0) return;

    const observer = new IntersectionObserver(
      (observed) => {
        if (isScrollingFromChip.current) return;
        let best: { id: string; ratio: number } | null = null;
        for (const entry of observed) {
          const id = entry.target.getAttribute("data-tf");
          if (!id) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { id, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio > 0) {
          setSelectedTimeframe(best.id);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    entries.forEach(([id, el]) => {
      if (el) {
        el.setAttribute("data-tf", id);
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [isLoading]);

  const [sentimentK, setSentimentK] = useState(7);
  useEffect(() => {
    if (!firestore) return;
    getDoc(doc(firestore, "config", "sentiment"))
      .then((snap) => {
        if (snap.exists()) {
          const k = snap.data()?.k;
          if (typeof k === "number" && k > 0) setSentimentK(k);
        }
      })
      .catch(() => {});
  }, [firestore]);

  const sentimentByTimeframe = useMemo(() => {
    const result: Record<string, ReturnType<typeof computeSentiment>> = {};
    if (!rawSignals) return result;

    const signalsByTf: Record<string, SignalForSentiment[]> = {};
    OPPORTUNITY_CATEGORIES.forEach((c) => { signalsByTf[c.id] = []; });

    rawSignals.forEach((signal: any) => {
      if (signal.status === "INACTIVE") return;
      if (getDisplayAssetType(signal) !== "CRYPTO") return;
      const tf = String(signal.timeframe || "").toUpperCase();
      const cat = tf === "D" ? "D" : tf;
      if (!signalsByTf[cat]) return;
      signalsByTf[cat].push({
        type: signal.type === "BUY" ? "BUY" : "SELL",
        receivedAt: signal.receivedAt,
        currentPrice: signal.currentPrice ?? null,
        price: Number(signal.price || 0),
      });
    });

    OPPORTUNITY_CATEGORIES.forEach((c) => {
      result[c.id] = computeSentiment(signalsByTf[c.id], c.id, sentimentK);
    });
    return result;
  }, [rawSignals, sentimentK]);

  useTradeAlerts(rawSignals, sentimentByTimeframe);

  type CountsMap = Record<string, Record<SideKey, Record<StatusKey, number>>>;
  type IdsMap = Record<string, Record<SideKey, Record<StatusKey, string[]>>>;

  const buildCountsAndIds = useCallback((signals: any[] | null, onlyAligned: boolean) => {
    const countMap: CountsMap = {};
    const idsMap: IdsMap = {};
    OPPORTUNITY_CATEGORIES.forEach((c) => {
      countMap[c.id] = { BUY: { working: 0, "not-working": 0, neutral: 0 }, SELL: { working: 0, "not-working": 0, neutral: 0 } };
      idsMap[c.id] = { BUY: { working: [], "not-working": [], neutral: [] }, SELL: { working: [], "not-working": [], neutral: [] } };
    });
    if (!signals) return { counts: countMap, ids: idsMap };
    signals.forEach((signal: any) => {
      if (signal.status === "INACTIVE") return;
      if (onlyAligned && signal.aligned !== true) return;
      if (getDisplayAssetType(signal) !== "CRYPTO") return;
      const tf = String(signal.timeframe || "").toUpperCase();
      const cat = tf === "D" ? "D" : tf;
      if (!countMap[cat]) return;
      const pnl = effectivePnl(signal);
      const status = getPnlStatus(pnl);
      const side: SideKey = signal.type === "BUY" ? "BUY" : "SELL";
      countMap[cat][side][status]++;
      idsMap[cat][side][status].push(signal.id);
    });
    return { counts: countMap, ids: idsMap };
  }, []);

  const { counts, ids: signalIds } = useMemo(() => buildCountsAndIds(rawSignals, false), [rawSignals, buildCountsAndIds]);
  const { counts: premiumCounts, ids: premiumSignalIds } = useMemo(() => buildCountsAndIds(rawSignals, true), [rawSignals, buildCountsAndIds]);

  const FRESHNESS_MINUTES: Record<string, number> = { "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440 };

  const computeLatestByTf = useCallback((signals: any[] | null, onlyAligned: boolean) => {
    const m: Record<string, { id: string; ticker: string; type: string; receivedAt: string; ts: number }> = {};
    if (!signals) return m;
    signals.forEach((signal: any) => {
      if (signal.status === "INACTIVE") return;
      if (onlyAligned && signal.aligned !== true) return;
      if (getDisplayAssetType(signal) !== "CRYPTO") return;
      const tf = String(signal.timeframe || "").toUpperCase();
      const cat = tf === "D" ? "D" : tf;
      const ts = new Date(signal.receivedAt).getTime();
      if (!m[cat] || ts > m[cat].ts) {
        m[cat] = { id: signal.id, ticker: signal.ticker, type: signal.type, receivedAt: signal.receivedAt, ts };
      }
    });
    return m;
  }, []);

  const latestSignalByTf = useMemo(() => computeLatestByTf(rawSignals, false), [rawSignals, computeLatestByTf]);
  const premiumLatestSignalByTf = useMemo(() => computeLatestByTf(rawSignals, true), [rawSignals, computeLatestByTf]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const computeFreshSignals = useCallback((latestMap: Record<string, { id: string; ticker: string; type: string; receivedAt: string; ts: number }>) => {
    const result: Record<string, { id: string; ticker: string; type: string; receivedAt: string } | null> = {};
    const now = Date.now();
    OPPORTUNITY_CATEGORIES.forEach((c) => {
      const latest = latestMap[c.id];
      const windowMs = (FRESHNESS_MINUTES[c.id] ?? 15) * 60 * 1000;
      result[c.id] = latest && (now - latest.ts) < windowMs ? latest : null;
    });
    return result;
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const freshSignals = useMemo(() => computeFreshSignals(latestSignalByTf), [latestSignalByTf, tick, computeFreshSignals]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const premiumFreshSignals = useMemo(() => computeFreshSignals(premiumLatestSignalByTf), [premiumLatestSignalByTf, tick, computeFreshSignals]);

  const computeTopWinners = useCallback((signals: any[] | null, onlyAligned: boolean) => {
    const map: Record<string, WinnerSignal[]> = {};
    const windowMs: Record<string, number> = {};
    const now = Date.now();
    OPPORTUNITY_CATEGORIES.forEach((c) => {
      map[c.id] = [];
      windowMs[c.id] = c.windowHours * 60 * 60 * 1000;
    });
    if (!signals) return map;
    signals.forEach((signal: any) => {
      if (signal.status === "INACTIVE") return;
      if (onlyAligned && signal.aligned !== true) return;
      if (getDisplayAssetType(signal) !== "CRYPTO") return;
      const tf = String(signal.timeframe || "").toUpperCase();
      const cat = tf === "D" ? "D" : tf;
      if (!map[cat]) return;
      const signalTime = new Date(signal.receivedAt).getTime();
      if (now - signalTime > windowMs[cat]) return;
      const maxPnl = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type);
      if (maxPnl > 0.05) {
        const pnl = calculatePercent(signal.currentPrice, signal.price, signal.type);
        map[cat].push({
          symbol: signal.symbol || "???",
          pnl,
          maxPnl,
          type: signal.type,
          price: Number(signal.price || 0),
          currentPrice: signal.currentPrice != null ? Number(signal.currentPrice) : null,
          maxUpsidePrice: signal.maxUpsidePrice ?? null,
          maxDrawdownPrice: signal.maxDrawdownPrice ?? null,
          stopLoss: signal.stopLoss ?? null,
          receivedAt: signal.receivedAt,
          timeframe: signal.timeframe,
        });
      }
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => b.maxPnl - a.maxPnl);
      map[k] = map[k].slice(0, 5);
    });
    return map;
  }, []);

  const topWinners = useMemo(() => computeTopWinners(rawSignals, false), [rawSignals, computeTopWinners]);
  const premiumTopWinners = useMemo(() => computeTopWinners(rawSignals, true), [rawSignals, computeTopWinners]);

  const handleGoogleLogin = async () => {
    if (auth) {
      setIsLoggingIn(true);
      try {
        await initiateGoogleSignIn(auth);
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: e.message || "Could not authenticate with Google.",
        });
      } finally {
        setIsLoggingIn(false);
      }
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={handleGoogleLogin} isLoggingIn={isLoggingIn} />;
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 md:px-6 md:py-8 space-y-8">

            <div>
              <div className="flex items-start gap-3">
                <h1 className="text-xl font-black tracking-tight">Opportunity Finder</h1>
                <div className="relative flex items-center h-7 mt-[3px] rounded-full bg-white/[0.06] border border-white/10 p-0.5 w-[190px] shrink-0">
                  <div
                    className={cn(
                      "absolute top-0.5 h-[calc(100%-4px)] w-[calc(50%-2px)] rounded-full transition-all duration-300 ease-out",
                      premiumMode
                        ? "left-[calc(50%+1px)] bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_12px_-2px_rgba(245,158,11,0.4)]"
                        : "left-0.5 bg-accent shadow-[0_0_12px_-2px_rgba(var(--accent-rgb,100,200,255),0.3)]",
                    )}
                  />
                  <button
                    onClick={() => setPremiumMode(false)}
                    className={cn(
                      "relative z-10 flex-1 text-center text-[10px] font-black uppercase tracking-wider transition-colors duration-200",
                      !premiumMode ? "text-white" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setPremiumMode(true)}
                    className={cn(
                      "relative z-10 flex-1 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors duration-200",
                      premiumMode ? "text-white" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Crown className="h-2.5 w-2.5" />
                    Premium
                  </button>
                </div>
              </div>
              <TypewriterTagline />
            </div>

            {/* Mobile: sticky filter chips + vertical scroll with scroll-spy */}
            <div className="md:hidden space-y-4">
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md pb-3 -mx-4 px-4 pt-1">
                <div className="flex flex-wrap gap-2" ref={chipsContainerRef}>
                  {OPPORTUNITY_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleChipClick(cat.id)}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all border",
                        selectedTimeframe === cat.id
                          ? "bg-accent/20 border-accent/40 text-accent shadow-[0_0_12px_-2px_rgba(var(--accent-rgb,245,158,11),0.3)]"
                          : "bg-white/[0.04] border-white/10 text-muted-foreground hover:bg-white/[0.08] hover:border-white/20 hover:text-foreground"
                      )}
                    >
                      {cat.chart}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="bg-[#121214] border-white/5 animate-pulse rounded-2xl">
                      <CardHeader className="pb-2"><div className="h-6 w-32 bg-white/10 rounded" /></CardHeader>
                      <CardContent><div className="h-48 bg-white/5 rounded" /></CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {OPPORTUNITY_CATEGORIES.map((cat) => (
                    <div key={cat.id} ref={(el) => { cardRefs.current[cat.id] = el; }}>
                      <OpportunityCard cat={cat} activeCounts={premiumMode ? premiumCounts : counts} signalIds={premiumMode ? premiumSignalIds : signalIds} sentimentByTimeframe={sentimentByTimeframe} topWinners={premiumMode ? premiumTopWinners : topWinners} onSelectWinner={setSelectedWinner} freshSignal={premiumMode ? premiumFreshSignals[cat.id] : freshSignals[cat.id]} premiumMode={premiumMode} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop: grid of all cards */}
            <div className="hidden md:block">
              {isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i} className="bg-[#121214] border-white/5 animate-pulse rounded-2xl">
                      <CardHeader className="pb-2"><div className="h-6 w-32 bg-white/10 rounded" /></CardHeader>
                      <CardContent><div className="h-48 bg-white/5 rounded" /></CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {OPPORTUNITY_CATEGORIES.map((cat) => (
                    <OpportunityCard key={cat.id} cat={cat} activeCounts={premiumMode ? premiumCounts : counts} signalIds={premiumMode ? premiumSignalIds : signalIds} sentimentByTimeframe={sentimentByTimeframe} topWinners={premiumMode ? premiumTopWinners : topWinners} onSelectWinner={setSelectedWinner} freshSignal={premiumMode ? premiumFreshSignals[cat.id] : freshSignals[cat.id]} premiumMode={premiumMode} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <TradeNarrationDialog signal={selectedWinner} open={!!selectedWinner} onClose={() => setSelectedWinner(null)} />
      </main>
    </div>
  );
}

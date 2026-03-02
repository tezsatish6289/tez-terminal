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
import { getEffectivePnl as getEffectivePnlShared } from "@/lib/pnl";

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

function effectivePnl(signal: any): number {
  return getEffectivePnlShared(signal);
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
  tp1?: number | null;
  tp2?: number | null;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp1BookedPnl?: number | null;
  tp2BookedPnl?: number | null;
  totalBookedPnl?: number | null;
  slHitAt?: string | null;
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
  const pnlVal = effectivePnl(signal);
  const leveragedPnl = pnlVal * leverage;
  const slDistance = signal.stopLoss ? calculatePercent(signal.stopLoss, signal.price, signal.type) : null;

  const hasMaxUpside = signal.maxUpsidePrice != null && signal.maxUpsidePrice > 0;
  const hasMaxDrawdown = signal.maxDrawdownPrice != null && signal.maxDrawdownPrice > 0;
  const hasStopLoss = signal.stopLoss != null && signal.stopLoss > 0;
  const hasTp = signal.tp1 != null && signal.tp2 != null;
  const pnlLabel = signal.totalBookedPnl != null ? "Booked PNL" : signal.tp1Hit ? "Partial + Live" : "Live PNL";

  let entryDate = "";
  try { entryDate = format(new Date(signal.receivedAt), "MMM dd, h:mm a"); } catch { entryDate = "—"; }

  const slWasThreatened = hasStopLoss && hasMaxDrawdown && (
    isBullish
      ? signal.maxDrawdownPrice! <= signal.stopLoss!
      : signal.maxDrawdownPrice! >= signal.stopLoss!
  );

  let stepNum = 1;

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
                <p className={cn("text-lg font-mono font-black", pnlVal >= 0 ? "text-positive" : "text-negative")}>
                  ${formatNarrationPrice(signal.currentPrice)}
                </p>
              </div>
            </div>

            {hasTp && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
                  <span className="text-[9px] uppercase font-black text-muted-foreground/60 tracking-widest">TP1</span>
                  <span className="text-sm font-mono font-bold">${formatNarrationPrice(signal.tp1)}</span>
                  <span className={cn("text-[9px] font-bold uppercase", signal.tp1Hit ? "text-positive" : "text-muted-foreground/40")}>
                    {signal.tp1Hit ? "✓ Hit" : "Pending"}
                    {signal.tp1BookedPnl != null && ` (+${signal.tp1BookedPnl.toFixed(2)}%)`}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
                  <span className="text-[9px] uppercase font-black text-muted-foreground/60 tracking-widest">TP2</span>
                  <span className="text-sm font-mono font-bold">${formatNarrationPrice(signal.tp2)}</span>
                  <span className={cn("text-[9px] font-bold uppercase", signal.tp2Hit ? "text-positive" : "text-muted-foreground/40")}>
                    {signal.tp2Hit ? "✓ Hit" : "Pending"}
                    {signal.tp2BookedPnl != null && ` (+${signal.tp2BookedPnl.toFixed(2)}%)`}
                  </span>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-3 space-y-3">
              <span className="text-[9px] uppercase font-black tracking-widest text-accent block text-center">Returns at {leverage}x Leverage</span>
              <div className="rounded-lg border bg-white/5 border-white/10 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{pnlLabel}</span>
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
              {/* Step 1: The Call */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">{stepNum++}</div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">The Call</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                  TezTerminal identified a <span className="font-bold text-foreground">{direction}</span> opportunity on{" "}
                  <span className="font-bold text-foreground">{signal.symbol}</span> at{" "}
                  <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.price)}</span> on{" "}
                  <span className="font-bold text-foreground">{entryDate}</span>.
                  {hasTp && (
                    <> Targets set at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.tp1)}</span> (TP1)
                    {" "}and <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.tp2)}</span> (TP2).</>
                  )}
                </p>
              </div>

              {/* Step 2: The Journey */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">{stepNum++}</div>
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

              {/* Step 3: Strategy Execution (only for tp1/tp2 trades) */}
              {hasTp && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">{stepNum++}</div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">Strategy Execution</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                    {signal.tp1Hit ? (
                      <>TP1 at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.tp1)}</span> was hit — 50% booked at{" "}
                      <span className="font-mono font-bold text-positive">+{(signal.tp1BookedPnl ?? 0).toFixed(2)}%</span>, stop loss moved to entry.{" "}
                      {signal.tp2Hit ? (
                        <>TP2 at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.tp2)}</span> was also hit — remaining 50% booked at{" "}
                        <span className="font-mono font-bold text-positive">+{(signal.tp2BookedPnl ?? 0).toFixed(2)}%</span>. Trade fully closed.</>
                      ) : signal.slHitAt ? (
                        <>Remaining position was stopped out at cost (breakeven). No additional loss.</>
                      ) : (
                        <>Remaining 50% still running with stop at entry (risk-free).</>
                      )}</>
                    ) : signal.slHitAt ? (
                      <>TP1 was not reached. Stop loss was triggered — trade closed with a loss of{" "}
                      <span className="font-mono font-bold text-negative">{(signal.totalBookedPnl ?? pnlVal).toFixed(2)}%</span>.</>
                    ) : (
                      <>Both targets are still pending. Stop loss at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.stopLoss)}</span> is protecting the position.</>
                    )}
                  </p>
                </div>
              )}

              {/* Risk Discipline (non-tp strategy or always) */}
              {hasStopLoss && !hasTp && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">{stepNum++}</div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">Risk Discipline</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                    Stop loss was set at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.stopLoss)}</span>{" "}
                    (<span className="font-mono font-bold text-foreground">{slDistance?.toFixed(2)}%</span> from entry).{" "}
                    <span className="font-bold text-foreground">{slWasThreatened ? "The stop zone was tested during the trade." : "It was never threatened."}</span>
                  </p>
                </div>
              )}

              {/* The Result */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-400/10 flex items-center justify-center text-[9px] font-black text-amber-400/70">{stepNum}</div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/70">The Result</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-7">
                  {signal.totalBookedPnl != null ? (
                    <>Trade closed with a total booked return of{" "}
                    <span className={cn("font-mono font-black text-base", leveragedPnl >= 0 ? "text-positive" : "text-negative")}>
                      {leveragedPnl >= 0 ? "+" : ""}{leveragedPnl.toFixed(2)}%
                    </span>{" "}at <span className="font-bold text-accent">{leverage}x</span> leverage.</>
                  ) : (
                    <>Currently trading at <span className="font-mono font-bold text-foreground">${formatNarrationPrice(signal.currentPrice)}</span>, delivering{" "}
                    <span className={cn("font-mono font-black text-base", leveragedPnl >= 0 ? "text-positive" : "text-negative")}>
                      {leveragedPnl >= 0 ? "+" : ""}{leveragedPnl.toFixed(2)}%
                    </span>{" "}returns at <span className="font-bold text-accent">{leverage}x</span> leverage.</>
                  )}
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

  if (winners.length === 0) return null;

  const winner = winners[activeIndex];
  const isBuy = winner.type === "BUY";
  return (
    <div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/50">Top winner · {windowLabel}</span>
      <button
        onClick={(e) => { e.preventDefault(); onSelect(winner); }}
        className="w-full flex items-center justify-between mt-0.5 hover:bg-amber-500/[0.05] rounded-md px-1 py-0.5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <span className={cn("text-sm font-black", isBuy ? "text-positive" : "text-negative")}>{isBuy ? "▲" : "▼"}</span>
          <span className="text-sm font-black text-foreground uppercase tracking-wider truncate">{winner.symbol}</span>
        </div>
        <span className="text-lg font-black font-mono text-amber-400">+{(winner.maxPnl * leverage).toFixed(2)}%</span>
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

function SideBarRow({ label, count, maxCount, href, color }: { label: string; count: number; maxCount: number; href: string; color: "positive" | "negative" | "muted" }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const colorMap = {
    positive: { bar: "bg-positive/30", text: "text-positive", hover: "hover:bg-positive/5" },
    negative: { bar: "bg-negative/30", text: "text-negative", hover: "hover:bg-negative/5" },
    muted: { bar: "bg-white/10", text: "text-muted-foreground", hover: "hover:bg-white/5" },
  };
  const s = colorMap[color];
  return (
    <Link href={href} className={cn("flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors", s.hover)}>
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 w-[52px] shrink-0">{label}</span>
      <span className={cn("text-sm font-black font-mono w-[28px] text-right shrink-0", s.text)}>{count}</span>
      <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", s.bar)} style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }} />
      </div>
    </Link>
  );
}

function sentimentPosition(label: string): number {
  const map: Record<string, number> = {
    "Bulls in control": 85,
    "Bulls taking over": 72,
    "Both winning": 50,
    "Choppy market": 50,
    "No clear trend": 50,
    "Bears taking over": 28,
    "Bears in control": 15,
  };
  return map[label] ?? 50;
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

  const bullTotal = c.BUY.working + c.BUY["not-working"] + c.BUY.neutral;
  const bearTotal = c.SELL.working + c.SELL["not-working"] + c.SELL.neutral;
  const bullMax = Math.max(c.BUY.working, c.BUY["not-working"], c.BUY.neutral, 1);
  const bearMax = Math.max(c.SELL.working, c.SELL["not-working"], c.SELL.neutral, 1);
  const mPos = sentimentPosition(sentiment.label);

  return (
    <Card className="bg-gradient-to-b from-[#141416] to-[#101012] border-white/5 shadow-2xl shadow-accent/5 overflow-hidden rounded-2xl transition-all duration-200 hover:translate-y-[-2px] hover:shadow-accent/10">
      {/* Header strip */}
      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-black uppercase tracking-tighter">{cat.name}</span>
            {freshSignal && <FreshnessDot />}
            <span className="text-white/15">·</span>
            <span className="text-[10px] font-bold uppercase text-accent/80 tracking-widest">{cat.chart}</span>
          </div>
          <span className="text-xs font-black uppercase text-accent tracking-wider">{cat.leverage}</span>
        </div>
        {freshSignal && (
          <Link href={`/chart/${freshSignal.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent hover:bg-accent/20 transition-colors">
            <span className={freshSignal.type === "BUY" ? "text-positive" : "text-negative"}>{freshSignal.type === "BUY" ? "▲" : "▼"}</span>
            <span>{freshSignal.ticker}</span>
            <span className="text-accent/50">·</span>
            <span className="text-accent/70">{formatTimeAgo(freshSignal.receivedAt)}</span>
          </Link>
        )}
      </div>

      {/* Momentum bar */}
      <div className="px-6 py-3 border-b border-white/5 space-y-1.5">
        <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-negative/25 via-white/5 to-positive/25">
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-white/80 shadow-lg transition-all duration-700"
            style={{
              left: `calc(${mPos}% - 7px)`,
              backgroundColor: mPos > 60 ? "var(--positive)" : mPos < 40 ? "var(--negative)" : "var(--muted-foreground)",
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-wider text-negative/50">Bears</span>
          <span className={cn("text-[10px] font-black uppercase tracking-widest", sentiment.color)}>{sentiment.label}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-positive/50">Bulls</span>
        </div>
      </div>

      <CardContent className="p-6 space-y-5">
        {/* Top Winners */}
        <WinnersTicker winners={topWinners[cat.id] ?? []} windowLabel={cat.windowLabel} leverage={getLeverage(cat.id)} onSelect={onSelectWinner} />

        {/* Bulls */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 mb-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-positive" />
              <span className="text-[10px] font-black uppercase tracking-wider text-positive">Bulls</span>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground/40">{bullTotal} trades</span>
          </div>
          <SideBarRow label="Winning" count={c.BUY.working} maxCount={bullMax} href={boxHref("BUY", "working")} color="positive" />
          <SideBarRow label="Losing" count={c.BUY["not-working"]} maxCount={bullMax} href={boxHref("BUY", "not-working")} color="negative" />
          <SideBarRow label="Neutral" count={c.BUY.neutral} maxCount={bullMax} href={boxHref("BUY", "neutral")} color="muted" />
        </div>

        {/* Bears */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 mb-1">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-3.5 w-3.5 text-negative" />
              <span className="text-[10px] font-black uppercase tracking-wider text-negative">Bears</span>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground/40">{bearTotal} trades</span>
          </div>
          <SideBarRow label="Winning" count={c.SELL.working} maxCount={bearMax} href={boxHref("SELL", "working")} color="positive" />
          <SideBarRow label="Losing" count={c.SELL["not-working"]} maxCount={bearMax} href={boxHref("SELL", "not-working")} color="negative" />
          <SideBarRow label="Neutral" count={c.SELL.neutral} maxCount={bearMax} href={boxHref("SELL", "neutral")} color="muted" />
        </div>
      </CardContent>
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
      const pnl = effectivePnl(signal);
      const maxPnl = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type);
      if (pnl > 0.05 || maxPnl > 0.05) {
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
          tp1: signal.tp1 ?? null,
          tp2: signal.tp2 ?? null,
          tp1Hit: signal.tp1Hit ?? false,
          tp2Hit: signal.tp2Hit ?? false,
          tp1BookedPnl: signal.tp1BookedPnl ?? null,
          tp2BookedPnl: signal.tp2BookedPnl ?? null,
          totalBookedPnl: signal.totalBookedPnl ?? null,
          slHitAt: signal.slHitAt ?? null,
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

"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser, useAuth, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Zap, Loader2, Chrome, TrendingUp, TrendingDown, BarChart3, Target } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@/lib/utils";

const OPPORTUNITY_CATEGORIES = [
  { id: "5", name: "Scalping", chart: "5 min" },
  { id: "15", name: "Intraday", chart: "15 min" },
  { id: "60", name: "BTST", chart: "1 hr" },
  { id: "240", name: "Swing", chart: "4 hr" },
  { id: "D", name: "Buy and hold", chart: "Daily" },
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

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "signals"), orderBy("receivedAt", "desc"), limit(200));
  }, [user, firestore]);

  const { data: rawSignals, isLoading } = useCollection(signalsQuery);

  const counts = useMemo(() => {
    const map: Record<string, Record<SideKey, Record<StatusKey, number>>> = {};
    OPPORTUNITY_CATEGORIES.forEach((c) => {
      map[c.id] = { BUY: { working: 0, "not-working": 0, neutral: 0 }, SELL: { working: 0, "not-working": 0, neutral: 0 } };
    });
    if (!rawSignals) return map;
    rawSignals.forEach((signal: any) => {
      if (signal.status === "INACTIVE") return;
      if (getDisplayAssetType(signal) !== "CRYPTO") return;
      const tf = String(signal.timeframe || "").toUpperCase();
      const cat = tf === "D" ? "D" : tf;
      if (!map[cat]) return;
      const pnl = calculatePercent(signal.currentPrice, signal.price, signal.type);
      const status = getPnlStatus(pnl);
      const side = signal.type === "BUY" ? "BUY" : "SELL";
      map[cat][side][status]++;
    });
    return map;
  }, [rawSignals]);

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
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <div className="bg-primary p-4 rounded-2xl border border-accent/20 inline-block mx-auto mb-6">
              <Zap className="h-10 w-10 text-accent fill-accent/20" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tighter text-foreground">TezTerminal</CardTitle>
            <CardDescription className="text-base mt-2">
              India's Premier Antigravity Trading Hub.
              Sign in with Google to access the live idea stream.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="w-full h-14 gap-3 bg-white text-black hover:bg-white/90 text-lg font-semibold"
            >
              {isLoggingIn ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Chrome className="h-6 w-6" />
                  Sign in with Google
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground px-6">
              Administrator login: <span className="text-accent font-mono">hello@tezterminal.com</span>
            </p>
            <p className="text-center text-[10px] text-muted-foreground/70 px-6 pt-2">
              If sign-in fails or pops up blank, try <a href="?auth=redirect" className="text-accent underline">?auth=redirect</a> or use an incognito window.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
            <header className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2.5 rounded-xl border border-white/10">
                  <Target className="h-6 w-6 text-accent" />
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-foreground uppercase tracking-tighter">Opportunity Finder</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl">
                Live crypto signals by timeframe. Bullish and bearish opportunities with working, not working, and neutral counts.
              </p>
            </header>

            {isLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-card/50 border-white/5 animate-pulse">
                    <CardHeader className="pb-2"><div className="h-6 w-32 bg-white/10 rounded" /></CardHeader>
                    <CardContent><div className="h-32 bg-white/5 rounded" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {OPPORTUNITY_CATEGORIES.map((cat) => {
                  const c = counts[cat.id] ?? { BUY: { working: 0, "not-working": 0, neutral: 0 }, SELL: { working: 0, "not-working": 0, neutral: 0 } };
                  const totalBull = c.BUY.working + c.BUY["not-working"] + c.BUY.neutral;
                  const totalBear = c.SELL.working + c.SELL["not-working"] + c.SELL.neutral;
                  return (
                    <Card key={cat.id} className="bg-card/50 border-white/5 shadow-xl overflow-hidden">
                      <CardHeader className="pb-3 border-b border-white/5">
                        <CardTitle className="text-lg font-black uppercase tracking-tight">{cat.name}</CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground">{cat.chart} chart</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-positive" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-positive">Bullish</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <Link href={`/terminal?timeframe=${cat.id}&side=BUY&status=working`} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-positive/10 border-positive/20 hover:bg-positive/20")}>
                              <div className="text-lg font-black font-mono text-positive">{c.BUY.working}</div>
                              <div className="text-[9px] font-bold uppercase text-positive/80">Working</div>
                            </Link>
                            <Link href={`/terminal?timeframe=${cat.id}&side=BUY&status=not-working`} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-negative/10 border-negative/20 hover:bg-negative/20")}>
                              <div className="text-lg font-black font-mono text-negative">{c.BUY["not-working"]}</div>
                              <div className="text-[9px] font-bold uppercase text-negative/80">Not working</div>
                            </Link>
                            <Link href={`/terminal?timeframe=${cat.id}&side=BUY&status=neutral`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center hover:bg-white/10 transition-colors">
                              <div className="text-lg font-black font-mono text-foreground">{c.BUY.neutral}</div>
                              <div className="text-[9px] font-bold uppercase text-muted-foreground">Neutral</div>
                            </Link>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-negative" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-negative">Bearish</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <Link href={`/terminal?timeframe=${cat.id}&side=SELL&status=working`} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-positive/10 border-positive/20 hover:bg-positive/20")}>
                              <div className="text-lg font-black font-mono text-positive">{c.SELL.working}</div>
                              <div className="text-[9px] font-bold uppercase text-positive/80">Working</div>
                            </Link>
                            <Link href={`/terminal?timeframe=${cat.id}&side=SELL&status=not-working`} className={cn("rounded-lg border px-3 py-2 text-center transition-colors", "bg-negative/10 border-negative/20 hover:bg-negative/20")}>
                              <div className="text-lg font-black font-mono text-negative">{c.SELL["not-working"]}</div>
                              <div className="text-[9px] font-bold uppercase text-negative/80">Not working</div>
                            </Link>
                            <Link href={`/terminal?timeframe=${cat.id}&side=SELL&status=neutral`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center hover:bg-white/10 transition-colors">
                              <div className="text-lg font-black font-mono text-foreground">{c.SELL.neutral}</div>
                              <div className="text-[9px] font-bold uppercase text-muted-foreground">Neutral</div>
                            </Link>
                          </div>
                        </div>
                        <Link
                          href={`/terminal?timeframe=${cat.id}`}
                          className="block w-full rounded-lg border border-accent/30 bg-accent/5 py-2 text-center text-[10px] font-black uppercase text-accent hover:bg-accent/10 transition-colors"
                        >
                          Open terminal →
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, useCollection, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit, where, getDocs, doc, setDoc } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Lock, 
  Terminal, 
  ShieldAlert, 
  Info, 
  Activity, 
  Lightbulb, 
  Zap,
  Copy,
  ExternalLink,
  ShieldCheck,
  Server,
  Monitor,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Github,
  Code2,
  Brain,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChromeIcon } from "@/components/icons";
import { useState, useEffect, useMemo, useCallback } from "react";
import { AUTO_FILTER_THRESHOLD } from "@/lib/auto-filter";
import { useToast } from "@/hooks/use-toast";

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClientSyncing, setIsClientSyncing] = useState(false);
  const [origin, setOrigin] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentOrigin = window.location.origin;
      setOrigin(currentOrigin);
    }
  }, []);

  const isAdmin = user?.email === "hello@tezterminal.com";
  const CRON_SECRET = "ANTIGRAVITY_SYNC_TOKEN_2024";
  const cronUrl = origin ? `${origin}/api/cron/sync-prices?key=${CRON_SECRET}` : "Generating secure URL...";

  const logsQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return query(collection(firestore, "logs"), orderBy("timestamp", "desc"), limit(50));
  }, [firestore, isAdmin]);

  const { data: logs, isLoading: isLogsLoading } = useCollection(logsQuery);

  const hasRegionBlock = useMemo(() => {
    return logs?.some(log => log.level === 'ERROR' && (log.details?.includes('451') || log.message?.includes('Mirror Exhaustion')));
  }, [logs]);

  // ── AI Filter config ─────────────────────────────────────
  const filterCfgRef = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return doc(firestore, "config", "auto_filter");
  }, [firestore, isAdmin]);
  const { data: filterCfgDoc } = useDoc<Record<string, any>>(filterCfgRef);
  const savedBaseThreshold = (filterCfgDoc as any)?.baseThreshold ?? AUTO_FILTER_THRESHOLD;
  const [pendingThreshold, setPendingThreshold] = useState<number | null>(null);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  useEffect(() => {
    setPendingThreshold(null);
  }, [savedBaseThreshold]);

  const handleSaveThreshold = useCallback(async () => {
    if (!firestore || pendingThreshold === null) return;
    setIsSavingThreshold(true);
    try {
      await setDoc(doc(firestore, "config", "auto_filter"), {
        baseThreshold: pendingThreshold,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || "unknown",
      }, { merge: true });
      toast({ title: "Base threshold updated", description: `Set to ${pendingThreshold}` });
      setPendingThreshold(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to save", description: e.message });
    } finally {
      setIsSavingThreshold(false);
    }
  }, [firestore, pendingThreshold, user?.email, toast]);

  // ── AI Filter data ────────────────────────────────────────
  const regimeDocRef = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return doc(firestore, "config", "market_regime");
  }, [firestore, isAdmin]);

  const { data: regimeDoc } = useDoc<Record<string, any>>(regimeDocRef);

  const rejectedQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return query(
      collection(firestore, "signals"),
      where("autoFilterPassed", "==", false),
    );
  }, [firestore, isAdmin]);

  const passedQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return query(
      collection(firestore, "signals"),
      where("autoFilterPassed", "==", true),
    );
  }, [firestore, isAdmin]);

  const { data: rawRejected, isLoading: isRejectedLoading } = useCollection(rejectedQuery);
  const { data: rawPassed, isLoading: isPassedLoading } = useCollection(passedQuery);

  const rejectedSignals = useMemo(() => {
    if (!rawRejected) return null;
    return [...rawRejected].sort((a, b) => {
      const ta = a.lastScoredAt ? new Date(a.lastScoredAt).getTime() : 0;
      const tb = b.lastScoredAt ? new Date(b.lastScoredAt).getTime() : 0;
      return tb - ta;
    });
  }, [rawRejected]);

  const passedSignals = useMemo(() => {
    if (!rawPassed) return null;
    return [...rawPassed].sort((a, b) => {
      const ta = a.lastScoredAt ? new Date(a.lastScoredAt).getTime() : 0;
      const tb = b.lastScoredAt ? new Date(b.lastScoredAt).getTime() : 0;
      return tb - ta;
    });
  }, [rawPassed]);

  const filterStats = useMemo(() => {
    const passed = passedSignals?.length ?? 0;
    const rejected = rejectedSignals?.length ?? 0;
    const total = passed + rejected;
    const rejectionRate = total > 0 ? ((rejected / total) * 100).toFixed(1) : "0";

    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const passed24h = passedSignals?.filter(s => s.lastScoredAt && now - new Date(s.lastScoredAt).getTime() < h24).length ?? 0;
    const rejected24h = rejectedSignals?.filter(s => s.lastScoredAt && now - new Date(s.lastScoredAt).getTime() < h24).length ?? 0;
    const total24h = passed24h + rejected24h;
    const rejRate24h = total24h > 0 ? ((rejected24h / total24h) * 100).toFixed(1) : "0";

    return { passed, rejected, total, rejectionRate, passed24h, rejected24h, total24h, rejRate24h };
  }, [passedSignals, rejectedSignals]);

  const regimeEntries = useMemo(() => {
    if (!regimeDoc) return [];
    const entries: { key: string; tf: string; side: string; winRate: number; sampleSize: number; slCount: number; threshold: number; history: number[]; lastUpdated: string }[] = [];
    for (const [key, val] of Object.entries(regimeDoc)) {
      if (key === "id" || key === "lastUpdated") continue;
      if (!val || typeof val !== "object" || !("adjustedThreshold" in val)) continue;
      const [tf, side] = key.split("_");
      entries.push({
        key,
        tf: tf || "?",
        side: side || "?",
        winRate: val.winRate ?? 0,
        sampleSize: val.sampleSize ?? 0,
        slCount: val.recentSlCount ?? 0,
        threshold: val.adjustedThreshold ?? 55,
        history: val.thresholdHistory ?? [],
        lastUpdated: val.lastUpdated ?? "",
      });
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }, [regimeDoc]);

  const regimeStaleness = useMemo(() => {
    if (!regimeDoc?.lastUpdated) return { stale: true, agoMs: 0, label: "Unknown" };
    const ago = Date.now() - new Date(regimeDoc.lastUpdated as string).getTime();
    const stale = ago > 5 * 60 * 1000;
    const mins = Math.floor(ago / 60000);
    const secs = Math.floor((ago % 60000) / 1000);
    return { stale, agoMs: ago, label: mins > 0 ? `${mins}m ${secs}s ago` : `${secs}s ago` };
  }, [regimeDoc]);

  const handleGoogleLogin = () => {
    if (auth) initiateGoogleSignIn(auth);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Value copied to clipboard." });
  };

  const handleForceSync = async () => {
    if (!isAdmin) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`${window.location.origin}/api/cron/sync-prices?key=${CRON_SECRET}`);
      const data = await res.json();
      if (data.success) {
        toast({ title: "Server Sync Executed", description: `Updated ${data.updated} signals.` });
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Server Blocked", description: "Binance is still blocking the US region." });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClientSync = async () => {
    if (!isAdmin || !firestore) return;
    setIsClientSyncing(true);
    try {
      const [fRes, sRes] = await Promise.all([
        fetch("https://fapi.binance.com/fapi/v2/ticker/price"),
        fetch("https://api.binance.com/api/v3/ticker/price")
      ]);

      if (!fRes.ok || !sRes.ok) throw new Error("Binance API Blocked locally.");

      const fData = await fRes.ok ? await fRes.json() : [];
      const sData = await sRes.ok ? await sRes.json() : [];
      const priceMap: Record<string, number> = {};
      [...fData, ...sData].forEach((p: any) => { priceMap[p.symbol.toUpperCase()] = parseFloat(p.price); });

      const snap = await getDocs(collection(firestore, "signals"));
      let count = 0;

      for (const signalDoc of snap.docs) {
        const signal = signalDoc.data();
        if (signal.status !== "ACTIVE") continue;
        if (signal.autoFilterPassed === false) continue;
        const base = (signal.symbol || "").split(':').pop() || "";
        const sym = base.replace(/\.P$|\.PERP$/i, '').toUpperCase();
        if (priceMap[sym]) {
          updateDocumentNonBlocking(doc(firestore, "signals", signalDoc.id), {
            currentPrice: priceMap[sym],
            lastSyncAt: new Date().toISOString()
          });
          count++;
        }
      }

      toast({ title: "Browser Sync Success", description: `Updated ${count} signals using your local IP.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Sync Failed", description: e.message });
    } finally {
      setIsClientSyncing(false);
    }
  };

  if (isUserLoading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-accent mx-auto mb-4" />
            <CardTitle>Security Checkpoint</CardTitle>
            <CardDescription>Sign in with your Google account to access history.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGoogleLogin} className="w-full h-12 gap-2 bg-white text-black hover:bg-white/90">
              <ChromeIcon className="h-5 w-5" /> Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <ShieldAlert className="h-12 w-12 text-rose-400 mx-auto mb-4" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>This page is only available to administrators.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">System Audit Trail</h1>
              <p className="text-muted-foreground text-sm">Monitoring sync health and signal ingestion metrics.</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-400 opacity-20" />
          </div>

          {hasRegionBlock && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-rose-500/10 border-rose-500/30 shadow-2xl overflow-hidden">
                 <CardHeader className="pb-3 border-b border-rose-500/20">
                    <div className="flex items-center gap-3">
                      <div className="bg-rose-500 p-2.5 rounded-xl border border-rose-400/20"><AlertTriangle className="h-6 w-6 text-white" /></div>
                      <div>
                         <CardTitle className="text-rose-400 text-xl font-black uppercase tracking-tighter">Region Block: US-EAST</CardTitle>
                         <CardDescription className="text-rose-300/60 font-bold uppercase text-[10px]">Binance has blocked your current cloud region (451).</CardDescription>
                      </div>
                    </div>
                 </CardHeader>
                 <CardContent className="space-y-6 pt-6">
                    <div className="space-y-4">
                       <p className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                         <Github className="h-4 w-4 text-accent" /> GitHub Mirror Status
                       </p>
                       <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-3">
                          <div className="flex items-center justify-between text-[10px]">
                             <span className="text-muted-foreground font-bold">REPOS:</span>
                             <span className="text-white font-mono">tezsatish6289/tez-terminal</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                             <span className="text-muted-foreground font-bold">STATUS:</span>
                             <span className="text-amber-400 font-bold">WAITING FOR CODE</span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-4">
                       <Button onClick={handleClientSync} disabled={isClientSyncing} className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] h-10 px-8 rounded-xl">
                          {isClientSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Monitor className="h-4 w-4 mr-2" />} Lucknow Override
                       </Button>
                       <Button variant="outline" className="border-white/10 text-muted-foreground text-[10px] font-bold uppercase h-10 px-8 rounded-xl bg-white/5" asChild>
                          <a href="https://github.com/tezsatish6289/tez-terminal" target="_blank">Open GitHub <ExternalLink className="h-3 w-3 ml-2" /></a>
                       </Button>
                    </div>
                 </CardContent>
              </Card>

              <Card className="bg-accent/5 border-accent/20 shadow-2xl">
                 <CardHeader className="pb-3 border-b border-accent/20">
                    <div className="flex items-center gap-3">
                       <div className="bg-accent p-2.5 rounded-xl border border-accent/20"><Code2 className="h-6 w-6 text-black" /></div>
                       <div>
                          <CardTitle className="text-accent text-xl font-black uppercase tracking-tighter">Terminal Workflow</CardTitle>
                          <CardDescription className="text-accent/60 font-bold uppercase text-[10px]">Run these commands in your Mac Terminal.</CardDescription>
                       </div>
                    </div>
                 </CardHeader>
                 <CardContent className="pt-6">
                    <div className="bg-black/60 p-4 rounded-xl border border-white/5 font-mono text-[10px] text-emerald-400 space-y-2 overflow-x-auto">
                       <p className="text-muted-foreground"># Uploading your code to GitHub</p>
                       <p>git init</p>
                       <p>git remote add origin https://github.com/tezsatish6289/tez-terminal.git</p>
                       <p>git add .</p>
                       <p>git commit -m "Migration to Asia"</p>
                       <p>git push -u origin main</p>
                    </div>
                    <div className="mt-4 p-3 bg-white/5 rounded-lg text-[10px] text-muted-foreground leading-relaxed">
                       <p>Once pushed, select the <span className="text-white font-bold">Singapore</span> region in the Firebase Hosting setup to restore 24/7 sync.</p>
                    </div>
                 </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="debugger" className="w-full">
            <TabsList className="bg-secondary/30 border border-border mb-6">
              <TabsTrigger value="signals" className="gap-2"><Lightbulb className="h-4 w-4" /> Signal Audit</TabsTrigger>
              <TabsTrigger value="ai-filter" className="gap-2"><Brain className="h-4 w-4" /> AI Filter</TabsTrigger>
              <TabsTrigger value="debugger" className="gap-2"><Terminal className="h-4 w-4" /> System Health</TabsTrigger>
            </TabsList>

            <TabsContent value="signals" className="mt-0">
              <Card className="bg-card border-border shadow-lg">
                <CardHeader className="border-b border-border/50">
                  <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-accent" /><CardTitle className="text-lg">Recent Feed History</CardTitle></div>
                </CardHeader>
                <CardContent className="pt-6 px-0"><SignalHistory /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai-filter" className="mt-0">
              <div className="space-y-6">
                {/* ── Summary Row ────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-card border-border">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Signals</p>
                      <p className="text-2xl font-black text-white">{filterStats.total}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{filterStats.total24h} last 24h</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-emerald-500/5 border-emerald-500/20">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest mb-1">Passed</p>
                      <p className="text-2xl font-black text-emerald-400">{filterStats.passed}</p>
                      <p className="text-[10px] text-emerald-400/50 mt-1">{filterStats.passed24h} last 24h</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-rose-500/5 border-rose-500/20">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-[10px] font-bold text-rose-400/60 uppercase tracking-widest mb-1">Rejected</p>
                      <p className="text-2xl font-black text-rose-400">{filterStats.rejected}</p>
                      <p className="text-[10px] text-rose-400/50 mt-1">{filterStats.rejected24h} last 24h</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="pt-5 pb-4 text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Rejection Rate</p>
                      <p className="text-2xl font-black text-white">{filterStats.rejectionRate}%</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{filterStats.rejRate24h}% last 24h</p>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Base Gate Threshold Control ───────── */}
                <Card className="bg-card border-border shadow-lg">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white mb-1">Base Gate Threshold</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Minimum AI score required for a signal to pass. Dynamic regime adjustments layer on top.
                          Lower = more signals pass. Higher = stricter filter.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={20}
                            max={80}
                            step={5}
                            value={pendingThreshold ?? savedBaseThreshold}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v)) setPendingThreshold(v);
                            }}
                            className="w-20 h-9 text-center font-mono font-bold text-lg bg-secondary/30 border-border"
                          />
                          <span className="text-xs text-muted-foreground">/ 100</span>
                        </div>
                        <Button
                          size="sm"
                          disabled={isSavingThreshold || pendingThreshold === null || pendingThreshold === savedBaseThreshold}
                          onClick={handleSaveThreshold}
                          className="h-9 px-4"
                        >
                          {isSavingThreshold ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* ── Dynamic Thresholds ────────────────── */}
                  <div className="lg:col-span-2">
                    <Card className="bg-card border-border shadow-lg">
                      <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Dynamic Thresholds</CardTitle>
                          <CardDescription className="text-xs">Per (timeframe, side) regime — updated every cron cycle.</CardDescription>
                        </div>
                        <div className={cn("flex items-center gap-2 text-[10px] font-bold px-3 py-1 rounded-full", regimeStaleness.stale ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20")}>
                          <Clock className="h-3 w-3" />
                          {regimeStaleness.stale ? "STALE" : "LIVE"} · {regimeStaleness.label}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        {regimeEntries.length === 0 ? (
                          <div className="py-12 text-center opacity-40">
                            <Brain className="h-10 w-10 mx-auto mb-3" />
                            <p className="text-sm">No regime data yet. Waiting for cron to compute market regime.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b border-border/30">
                                  <th className="text-left py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Regime</th>
                                  <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Threshold</th>
                                  <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Win Rate</th>
                                  <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Sample</th>
                                  <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">SL Hits</th>
                                  <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">MA History</th>
                                </tr>
                              </thead>
                              <tbody>
                                {regimeEntries.map((e) => {
                                  const tfLabels: Record<string, string> = { "5": "5M", "15": "15M", "60": "1H", "240": "4H", "D": "1D" };
                                  const wrPct = (e.winRate * 100).toFixed(0);
                                  const wrColor = e.winRate >= 0.6 ? "text-emerald-400" : e.winRate <= 0.35 ? "text-rose-400" : "text-amber-400";
                                  const thColor = e.threshold <= 45 ? "text-emerald-400" : e.threshold >= 65 ? "text-rose-400" : "text-accent";
                                  return (
                                    <tr key={e.key} className="border-b border-border/10 hover:bg-white/[0.02] transition-colors">
                                      <td className="py-2.5 px-3">
                                        <div className="flex items-center gap-2">
                                          {e.side === "BUY" ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-rose-400" />}
                                          <span className="font-bold text-white">{tfLabels[e.tf] ?? e.tf}</span>
                                          <span className={cn("text-[9px] font-bold uppercase", e.side === "BUY" ? "text-emerald-400" : "text-rose-400")}>{e.side}</span>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={cn("font-black text-sm", thColor)}>{e.threshold}</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={cn("font-bold", wrColor)}>{wrPct}%</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono text-white/60">{e.sampleSize}</td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={cn("font-bold", e.slCount > 0 ? "text-rose-400" : "text-white/30")}>{e.slCount}</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className="font-mono text-white/40 text-[10px]">{e.history.join(" → ")}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── Regime Info Sidebar ────────────────── */}
                  <div className="space-y-6">
                    <Card className="bg-accent/5 border-accent/20">
                      <CardHeader>
                        <div className="flex items-center gap-2"><ArrowUpDown className="h-5 w-5 text-accent" /><CardTitle className="text-md font-bold text-white">How It Works</CardTitle></div>
                      </CardHeader>
                      <CardContent className="text-[11px] text-muted-foreground space-y-3 leading-relaxed">
                        <p><b className="text-white">Formula:</b> threshold = 55 + (0.5 − winRate) × 40 + slPenalty</p>
                        <p><b className="text-white">Smoothing:</b> 5-period rolling MA to prevent spikes.</p>
                        <p><b className="text-white">Staleness:</b> If no update for 5 min, falls back to static 55.</p>
                        <p><b className="text-white">SL Window:</b> 6 candles per timeframe.</p>
                        <p><b className="text-white">Min Sample:</b> 5 signals to activate.</p>
                        <p><b className="text-white">Range:</b> Clamped to [35, 85].</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* ── Rejected Signals Log ─────────────────── */}
                <Card className="bg-card border-border shadow-lg">
                  <CardHeader className="border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-rose-400" />
                        <div>
                          <CardTitle className="text-lg">Rejected Signals</CardTitle>
                          <CardDescription className="text-xs">Signals that failed the AI filter — never shown to users.</CardDescription>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">Last {rejectedSignals?.length ?? 0} rejections</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {isRejectedLoading || isPassedLoading ? (
                      <div className="space-y-3 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded-lg" />)}</div>
                    ) : !rejectedSignals?.length ? (
                      <div className="py-12 text-center opacity-40">
                        <XCircle className="h-10 w-10 mx-auto mb-3" />
                        <p className="text-sm">No rejected signals yet.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border/30">
                              <th className="text-left py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Symbol</th>
                              <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">TF</th>
                              <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Side</th>
                              <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Score</th>
                              <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Threshold</th>
                              <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Gap</th>
                              <th className="text-center py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Reason</th>
                              <th className="text-right py-2 px-3 font-bold text-muted-foreground uppercase tracking-widest text-[9px]">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rejectedSignals.map((s) => {
                              const tfLabels: Record<string, string> = { "5": "5M", "15": "15M", "60": "1H", "240": "4H", "D": "1D" };
                              const sym = (s.symbol || "").replace(/^BINANCE:|\.P$/g, "");
                              const score = s.confidenceScore ?? 0;
                              const threshold = s.scoredAtThreshold ?? 55;
                              const gap = score - threshold;
                              const reason = s.confidenceLabel === "Stale" ? "Stale" : "Below threshold";
                              const time = s.lastScoredAt ? format(new Date(s.lastScoredAt), "MMM dd HH:mm") : "—";
                              return (
                                <tr key={s.id} className="border-b border-border/10 hover:bg-white/[0.02] transition-colors">
                                  <td className="py-2 px-3 font-bold text-white">{sym}</td>
                                  <td className="py-2 px-3 text-center text-white/60">{tfLabels[String(s.timeframe)] ?? s.timeframe}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className={cn("font-bold text-[10px]", s.type === "BUY" ? "text-emerald-400" : "text-rose-400")}>{s.type}</span>
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono font-bold text-rose-400">{Math.round(score)}</td>
                                  <td className="py-2 px-3 text-center font-mono text-white/60">{Math.round(threshold)}</td>
                                  <td className="py-2 px-3 text-center font-mono font-bold text-rose-400">{gap > 0 ? `+${gap.toFixed(0)}` : gap.toFixed(0)}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className={cn(
                                      "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full",
                                      reason === "Stale" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    )}>{reason}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono text-white/40">{time}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="debugger" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
                      <div><CardTitle className="text-lg">Heartbeat Log</CardTitle><CardDescription className="text-xs">Audit of automated 24/7 cron syncs.</CardDescription></div>
                      <div className="flex gap-2">
                         <Button variant="outline" size="sm" className="gap-2 border-accent/30 text-accent hover:bg-accent/10 h-8" onClick={handleForceSync} disabled={isSyncing}>
                            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Test Server Path
                         </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {!isAdmin ? <div className="py-20 text-center opacity-40"><ShieldAlert className="h-12 w-12 mx-auto mb-4" /><p>Admin Access Only.</p></div> : (
                        <div className="space-y-4">
                          {isLogsLoading ? <div className="space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/5 rounded-lg" />)}</div> : logs?.length === 0 ? <div className="py-20 text-center opacity-40"><Info className="h-12 w-12 mx-auto mb-4" /><p>Waiting for the first sync heartbeat...</p></div> : (
                            <div className="grid gap-4">
                              {logs?.map((log) => (
                                <div key={log.id} className={cn("p-4 rounded-xl border text-[11px] space-y-3 transition-all", log.level === 'ERROR' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/10')}>
                                  <div className="flex justify-between items-center opacity-60"><span className="font-bold uppercase">{log.level}</span><span className="font-mono">{format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}</span></div>
                                  <p className="text-white font-semibold text-sm leading-tight">{log.message}</p>
                                  {log.details && <div className="bg-black/40 p-3 rounded-lg text-muted-foreground font-mono text-[10px] whitespace-pre-wrap border border-white/5 overflow-x-hidden">{log.details}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card className="bg-accent/5 border-accent/20">
                    <CardHeader><div className="flex items-center gap-2"><Server className="h-5 w-5 text-accent" /><CardTitle className="text-md font-bold text-white">System Architecture</CardTitle></div></CardHeader>
                    <CardContent className="text-[11px] text-muted-foreground space-y-3 leading-relaxed">
                       <p><b>Server Sync:</b> Cloud Instance &rarr; Binance Mirrors.</p>
                       <p><b>Browser Sync:</b> Manual Override &rarr; Binance &rarr; DB.</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-emerald-500/5 border-emerald-500/20">
                    <CardHeader><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-400" /><CardTitle className="text-md font-bold text-white">Cron Endpoint</CardTitle></div></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase flex justify-between">Public Sync URL</Label>
                        <div className="flex gap-2">
                          <Input readOnly value={cronUrl} className="bg-background font-mono text-[10px] h-9 border-white/10" />
                          <Button variant="outline" size="icon" onClick={() => copyToClipboard(cronUrl)} className="h-9 w-9 shrink-0"><Copy className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

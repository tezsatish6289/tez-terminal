"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit, getDocs, doc } from "firebase/firestore";
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
  Code2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChromeIcon } from "@/components/icons";
import { useState, useEffect, useMemo } from "react";
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

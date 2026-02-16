"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit, getDocs, writeBatch, doc } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  History as HistoryIcon, 
  Loader2, 
  Lock, 
  Terminal, 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  Activity, 
  Lightbulb, 
  Trash2, 
  Zap,
  Copy,
  ExternalLink,
  Globe,
  ShieldCheck,
  Server,
  CloudOff,
  Cpu,
  Monitor,
  MapPin
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
  const [isPurging, setIsPurging] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClientSyncing, setIsClientSyncing] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentOrigin = window.location.origin;
      if (currentOrigin.includes("cloudworkstations.dev") || currentOrigin.includes("9002")) {
        setOrigin("https://studio--studio-6235588950-a15f2.us-central1.hosted.app");
      } else {
        setOrigin(currentOrigin);
      }
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
    return logs?.some(log => log.level === 'ERROR' && (log.details?.includes('451') || log.message?.includes('Restricted')));
  }, [logs]);

  const handleGoogleLogin = () => {
    if (auth) initiateGoogleSignIn(auth);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "URL copied to clipboard." });
  };

  const handleForceSync = async () => {
    if (!isAdmin) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`${window.location.origin}/api/cron/sync-prices?key=${CRON_SECRET}`);
      const data = await res.json();
      if (data.success) {
        toast({ title: "Server Sync Executed", description: `Updated ${data.updated} signals using server path.` });
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Server Path Blocked (451)", description: "Binance is blocking the server identity. Use Browser Sync." });
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

      if (!fRes.ok || !sRes.ok) throw new Error("Binance API Blocked locally too.");

      const fData = await fRes.json();
      const sData = await sRes.json();
      const priceMap: Record<string, number> = {};
      [...fData, ...sData].forEach((p: any) => { priceMap[p.symbol.toUpperCase()] = parseFloat(p.price); });

      const snap = await getDocs(collection(firestore, "signals"));
      let count = 0;

      for (const signalDoc of snap.docs) {
        const signal = signalDoc.data();
        if (signal.status !== "ACTIVE") continue;

        const base = (signal.symbol || "").split(':').pop() || "";
        const sym = base.replace(/\.P$|\.PERP$/i, '').toUpperCase();
        const variations = [sym, sym + "USDT", base];
        
        let price = 0;
        for (const v of variations) { if (priceMap[v]) { price = priceMap[v]; break; } }
        
        if (price) {
          updateDocumentNonBlocking(doc(firestore, "signals", signalDoc.id), {
            currentPrice: price,
            lastSyncAt: new Date().toISOString()
          });
          count++;
        }
      }

      toast({ title: "Browser Bridge Success", description: `Updated ${count} signals using your local IP.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Sync Failed", description: e.message });
    } finally {
      setIsClientSyncing(false);
    }
  };

  const handlePurgeSignals = async () => {
    if (!isAdmin || !firestore || purgeInput.toLowerCase() !== "purge") return;
    setIsPurging(true);
    try {
      const snapshot = await getDocs(query(collection(firestore, "signals")));
      const batch = writeBatch(firestore);
      snapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
      await batch.commit();
      toast({ title: "History Purged" });
      setIsDialogOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Purge Failed" });
    } finally {
      setIsPurging(false);
    }
  };

  if (isUserLoading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-accent mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please sign in with your Google account.</CardDescription>
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Terminal Activity</h1>
              <p className="text-muted-foreground text-sm">Audit trail of market alerts and system sync heartbeats.</p>
            </div>
            {isAdmin && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild><Button variant="destructive" size="sm" className="gap-2 font-bold h-9"><Trash2 className="h-4 w-4" /> Purge History</Button></DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Confirm Purge</DialogTitle></DialogHeader>
                  <Input placeholder="Type 'purge'..." value={purgeInput} onChange={(e) => setPurgeInput(e.target.value)} className="bg-background mt-4" />
                  <DialogFooter className="mt-4"><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handlePurgeSignals} disabled={purgeInput.toLowerCase() !== "purge" || isPurging}>{isPurging && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirm</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {hasRegionBlock && (
            <Card className="bg-rose-500/10 border-rose-500/30">
               <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-rose-500 p-2 rounded-lg"><MapPin className="h-5 w-5 text-white" /></div>
                    <div>
                       <CardTitle className="text-rose-400">CRITICAL: Server Region Restricted (451)</CardTitle>
                       <CardDescription className="text-rose-300/60 font-medium">Binance is blocking the terminal server. 24/7 Autonomy is currently Offline.</CardDescription>
                    </div>
                  </div>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div className="bg-black/40 p-4 rounded-xl border border-rose-500/20 text-xs text-rose-100/80 leading-relaxed">
                     <p className="font-bold text-rose-400 mb-2">How to restore 24/7 tracking:</p>
                     <ol className="list-decimal list-inside space-y-2 ml-2">
                        <li><b>Temporary Fix:</b> Use the <b>Browser Sync</b> button below while your computer is on. This uses your local IP (Lucknow) which is NOT blocked.</li>
                        <li><b>Permanent Fix:</b> Move the server to <b>Mumbai (asia-south1)</b> via the Firebase Console. This gives the terminal an Indian identity.</li>
                     </ol>
                  </div>
               </CardContent>
            </Card>
          )}

          <Tabs defaultValue="signals" className="w-full">
            <TabsList className="bg-secondary/30 border border-border mb-6">
              <TabsTrigger value="signals" className="gap-2"><Lightbulb className="h-4 w-4" /> Idea Stream</TabsTrigger>
              <TabsTrigger value="debugger" className="gap-2"><Terminal className="h-4 w-4" /> System Health</TabsTrigger>
            </TabsList>

            <TabsContent value="signals" className="mt-0">
              <Card className="bg-card border-border shadow-lg"><CardHeader className="border-b border-border/50"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-accent" /><CardTitle className="text-lg">Recent Signals</CardTitle></div></CardHeader>
              <CardContent className="pt-6 px-0"><SignalHistory /></CardContent></Card>
            </TabsContent>

            <TabsContent value="debugger" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
                      <div><CardTitle className="text-lg">Sync Audit Log</CardTitle><CardDescription className="text-xs">Monitoring the 24/7 background cron job</CardDescription></div>
                      <div className="flex gap-2">
                         <Button variant="outline" size="sm" className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-8" onClick={handleClientSync} disabled={isClientSyncing}>
                            {isClientSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Monitor className="h-3 w-3" />} Browser Sync
                         </Button>
                         <Button variant="outline" size="sm" className="gap-2 border-accent/30 text-accent hover:bg-accent/10 h-8" onClick={handleForceSync} disabled={isSyncing}>
                            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Test Server Sync
                         </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                         <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                            <p className="text-[10px] font-black text-emerald-400 uppercase mb-1 flex items-center gap-1.5"><Monitor className="h-3 w-3" /> Browser Override (Lucknow)</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">Uses your local connection to fetch prices. Bypasses all server-side blocks. Updates the database for everyone.</p>
                         </div>
                         <div className="p-3 bg-accent/5 rounded-lg border border-accent/10">
                            <p className="text-[10px] font-black text-accent uppercase mb-1 flex items-center gap-1.5"><Zap className="h-3 w-3" /> Server Sync (Automated)</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">This is the code your 24/7 cron-job hits. If this is red, the server is blocked by Binance.</p>
                         </div>
                      </div>

                      {!isAdmin ? <div className="py-20 text-center opacity-40"><ShieldAlert className="h-12 w-12 mx-auto mb-4" /><p>Logs available to administrators only.</p></div> : (
                        <div className="space-y-4">
                          {isLogsLoading ? <div className="space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/5 rounded-lg" />)}</div> : logs?.length === 0 ? <div className="py-20 text-center opacity-40"><Info className="h-12 w-12 mx-auto mb-4" /><p>Waiting for the first automated sync heartbeat...</p></div> : (
                            <div className="grid gap-4">
                              {logs?.map((log) => (
                                <div key={log.id} className={cn("p-4 rounded-xl border text-[11px] space-y-3 transition-all", log.level === 'ERROR' || log.details?.includes('451') ? 'bg-rose-500/5 border-rose-500/20' : log.level === 'WARN' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/10')}>
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
                    <CardHeader><div className="flex items-center gap-2"><Server className="h-5 w-5 text-accent" /><CardTitle className="text-md font-bold text-white">Sync Architecture</CardTitle></div></CardHeader>
                    <CardContent className="text-[11px] text-muted-foreground space-y-3 leading-relaxed">
                       <p><b>Automated Mode:</b> Next.js Server &rarr; Binance Mirrors. If all mirrors return 451, tracking stops.</p>
                       <p><b>Manual Override:</b> Your Browser &rarr; Binance &rarr; Terminal Firestore. This updates prices for all users globally.</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-emerald-500/5 border-emerald-500/20">
                    <CardHeader><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-400" /><CardTitle className="text-md font-bold text-white">Cron Configuration</CardTitle></div></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between">Public Sync Endpoint <span className="text-emerald-400">LIVE</span></Label>
                        <div className="flex gap-2">
                          <Input readOnly value={cronUrl} className="bg-background font-mono text-[10px] h-9 border-white/10" />
                          <Button variant="outline" size="icon" onClick={() => copyToClipboard(cronUrl)} className="h-9 w-9 shrink-0" disabled={!origin}><Copy className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      <Button asChild variant="outline" className="w-full h-9 border-accent/20 text-accent text-xs font-bold hover:bg-accent/10">
                        <a href="https://cron-job.org" target="_blank">Verify Job on Cron-Job.org <ExternalLink className="h-3 w-3 ml-2" /></a>
                      </Button>
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

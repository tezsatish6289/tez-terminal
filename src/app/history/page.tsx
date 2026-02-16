"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit, getDocs, writeBatch } from "firebase/firestore";
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
  Server
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChromeIcon } from "@/components/icons";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isPurging, setIsPurging] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Determine if we are in development (workstation) or production
      const currentOrigin = window.location.origin;
      if (currentOrigin.includes("cloudworkstations.dev") || currentOrigin.includes("9002")) {
        // Hardcode the production URL for the user to copy
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

  const { data: logs, isLoading: isLogsLoading, error: logsError } = useCollection(logsQuery);

  const handleGoogleLogin = () => {
    if (auth) {
      initiateGoogleSignIn(auth);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!origin) return;
    navigator.clipboard.writeText(text);
    toast({ title: "Production URL Copied", description: "Use this URL in cron-job.org for 24/7 sync." });
  };

  const handleForceSync = async () => {
    if (!isAdmin) return;
    setIsSyncing(true);
    try {
      // Use the actual current origin for the immediate manual sync button
      const currentOrigin = window.location.origin;
      const res = await fetch(`${currentOrigin}/api/cron/sync-prices?key=${CRON_SECRET}`);
      const data = await res.json();
      if (data.success) {
        toast({ 
          title: "Global Sync Complete", 
          description: `Updated ${data.updated} signals successfully.` 
        });
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (e: any) {
      toast({ 
        variant: "destructive", 
        title: "Sync Error", 
        description: e.message 
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurgeSignals = async () => {
    if (!isAdmin || !firestore || purgeInput.toLowerCase() !== "purge") return;
    
    setIsPurging(true);
    try {
      const q = query(collection(firestore, "signals"));
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(firestore);
      snapshot.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      
      toast({ 
        title: "History Purged", 
        description: `Successfully removed ${snapshot.size} signals.` 
      });
      setIsDialogOpen(false);
      setPurgeInput("");
    } catch (e: any) {
      toast({ 
        variant: "destructive", 
        title: "Purge Failed", 
        description: e.message 
      });
    } finally {
      setIsPurging(false);
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
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-accent mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please sign in with your Google account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGoogleLogin} className="w-full h-12 gap-2 bg-white text-black hover:bg-white/90">
              <ChromeIcon className="h-5 w-5" />
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDev = typeof window !== "undefined" && (window.location.hostname.includes("cloudworkstations.dev") || window.location.port === "9002");

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
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2 font-bold h-9">
                      <Trash2 className="h-4 w-4" />
                      Purge History
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader>
                      <DialogTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" /> Confirm Purge
                      </DialogTitle>
                      <DialogDescription className="text-muted-foreground pt-2">
                        Type <span className="text-white font-bold underline">purge</span> to delete all global signals.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                      <Input 
                        placeholder="Type 'purge'..." 
                        value={purgeInput}
                        onChange={(e) => setPurgeInput(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                      <Button 
                        variant="destructive" 
                        onClick={handlePurgeSignals}
                        disabled={purgeInput.toLowerCase() !== "purge" || isPurging}
                      >
                        {isPurging && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirm
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <Tabs defaultValue="signals" className="w-full">
            <TabsList className="bg-secondary/30 border border-border mb-6">
              <TabsTrigger value="signals" className="gap-2">
                <Lightbulb className="h-4 w-4" /> Idea Stream
              </TabsTrigger>
              <TabsTrigger value="debugger" className="gap-2">
                <Terminal className="h-4 w-4" /> System Health
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signals" className="mt-0">
              <Card className="bg-card border-border shadow-lg">
                <CardHeader className="border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-accent" />
                    <CardTitle className="text-lg">Recent Signals</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 px-0">
                  <SignalHistory />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="debugger" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Technical Logs</CardTitle>
                        <CardDescription className="text-xs">Live 24/7 Node Synchronization Audit</CardDescription>
                      </div>
                      {isAdmin && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-2 border-accent/30 text-accent hover:bg-accent/10 h-8"
                          onClick={handleForceSync}
                          disabled={isSyncing}
                        >
                          {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          Manual Sync
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="pt-6">
                      {!isAdmin ? (
                        <div className="py-20 text-center opacity-40">
                          <ShieldAlert className="h-12 w-12 mx-auto mb-4" />
                          <p>Logs available to administrators only.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {isLogsLoading ? (
                            <div className="space-y-4 animate-pulse">
                               {[1,2,3].map(i => <div key={i} className="h-20 bg-white/5 rounded-lg" />)}
                            </div>
                          ) : logs?.length === 0 ? (
                            <div className="py-20 text-center opacity-40">
                               <Info className="h-12 w-12 mx-auto mb-4" />
                               <p>No sync activity detected yet.</p>
                            </div>
                          ) : (
                            <div className="grid gap-4">
                              {logs?.map((log) => (
                                <div key={log.id} className={cn(
                                  "p-4 rounded-xl border text-[11px] space-y-3 transition-all",
                                  log.level === 'ERROR' ? 'bg-rose-500/5 border-rose-500/20' : 
                                  log.level === 'WARN' ? 'bg-amber-500/5 border-amber-500/20' : 
                                  'bg-emerald-500/5 border-emerald-500/10'
                                )}>
                                  <div className="flex justify-between items-center opacity-60">
                                    <span className="font-bold uppercase">{log.level}</span>
                                    <span className="font-mono">{format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}</span>
                                  </div>
                                  <p className="text-white font-semibold text-sm leading-tight">{log.message}</p>
                                  {log.details && (
                                    <div className="bg-black/40 p-3 rounded-lg text-muted-foreground font-mono text-[10px] whitespace-pre-wrap border border-white/5 overflow-x-hidden">
                                      {log.details}
                                    </div>
                                  )}
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
                  <Card className="bg-emerald-500/5 border-emerald-500/20">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-emerald-400" />
                        <CardTitle className="text-md font-bold text-white">Secure Cron Deployment</CardTitle>
                      </div>
                      <CardDescription className="text-xs">Schedule this URL to run every 5 minutes on cron-job.org.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {isDev && (
                        <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-start gap-3 mb-4">
                           <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                           <div className="text-[10px] leading-tight text-amber-200">
                             <b>Environment Warning:</b> You are in "Preview Mode". The URL below has been corrected to point to your <b>Public Published URL</b>.
                           </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between">
                          Public Sync Endpoint
                          <span className="text-emerald-400">PRODUCTION</span>
                        </Label>
                        <div className="flex gap-2">
                          <Input readOnly value={cronUrl} className="bg-background font-mono text-[10px] h-9 border-white/10" />
                          <Button variant="outline" size="icon" onClick={() => copyToClipboard(cronUrl)} className="h-9 w-9 shrink-0" disabled={!origin}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                        <div className="flex items-center gap-2">
                           <Server className="h-4 w-4 text-accent" />
                           <span className="text-xs font-bold text-white uppercase tracking-tight">Deployment Safety</span>
                        </div>
                        <ul className="text-[11px] space-y-3 text-muted-foreground">
                          <li className="flex gap-2">
                            <div className="h-1 w-1 rounded-full bg-accent mt-1.5 shrink-0" />
                            <span><b>Key Embedded:</b> The URL includes your secret `ANTIGRAVITY_SYNC_TOKEN_2024`.</span>
                          </li>
                          <li className="flex gap-2">
                            <div className="h-1 w-1 rounded-full bg-accent mt-1.5 shrink-0" />
                            <span><b>Encryption:</b> HTTPS is mandatory to protect your token from sniffing.</span>
                          </li>
                          <li className="flex gap-2">
                            <div className="h-1 w-1 rounded-full bg-accent mt-1.5 shrink-0" />
                            <span><b>Success check:</b> Look for "24/7 SYNC SUCCESS" in logs after scheduling.</span>
                          </li>
                        </ul>
                        <Button asChild variant="outline" className="w-full h-9 border-accent/20 text-accent text-xs font-bold hover:bg-accent/10">
                          <a href="https://cron-job.org" target="_blank">Open Cron-Job.org <ExternalLink className="h-3 w-3 ml-2" /></a>
                        </Button>
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

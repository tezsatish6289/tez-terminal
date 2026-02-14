"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History as HistoryIcon, Loader2, Lock, Terminal, ShieldAlert, AlertTriangle, Info, RefreshCw, Zap, Activity } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChromeIcon } from "@/components/icons";

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();

  const isAdmin = user?.email === "hello@tezterminal.com";

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
            <CardDescription>Please sign in with your Google account to view terminal history.</CardDescription>
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Terminal Activity</h1>
              <p className="text-muted-foreground text-sm">Full audit trail of market signals and system events.</p>
            </div>
            <HistoryIcon className="h-8 w-8 text-accent opacity-20" />
          </div>

          <Tabs defaultValue="signals" className="w-full">
            <TabsList className="bg-secondary/30 border border-border p-1 mb-6">
              <TabsTrigger value="signals" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                <Zap className="h-4 w-4" />
                Signal Stream
              </TabsTrigger>
              <TabsTrigger value="debugger" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                <Terminal className="h-4 w-4" />
                System Debugger
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signals" className="mt-0">
              <Card className="bg-card border-border shadow-lg">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-accent" />
                    <CardTitle className="text-lg">Live Feed</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <SignalHistory />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="debugger" className="mt-0">
              <Card className="bg-card border-border shadow-lg">
                <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Technical Logs</CardTitle>
                    <CardDescription className="text-xs">Live Ingestion Node (Admin Only)</CardDescription>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
                      <RefreshCw className="h-3 w-3 text-accent animate-spin-slow" />
                      <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Listening</span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-6">
                  {!isAdmin ? (
                    <div className="py-20 text-center">
                      <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                      <h3 className="text-lg font-semibold text-white">Access Restricted</h3>
                      <p className="text-sm text-muted-foreground">Only authorized terminal administrators can access debugging logs.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {logsError && (
                        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Failed to load logs: {logsError.message}
                        </div>
                      )}

                      {isLogsLoading ? (
                        <div className="grid gap-4">
                           {[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse bg-secondary/20 rounded-lg" />)}
                        </div>
                      ) : logs?.length === 0 ? (
                        <div className="py-20 text-center">
                           <Info className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                           <p className="text-muted-foreground">No ingestion hits detected yet.<br/>Ensure TradingView webhook URL and ID are correct.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {logs?.map((log) => (
                            <div key={log.id} className={cn(
                              "p-4 rounded-xl border text-[11px] space-y-3 transition-all hover:bg-secondary/20",
                              log.level === 'ERROR' ? 'bg-rose-500/5 border-rose-500/20' : 
                              log.level === 'WARN' ? 'bg-amber-500/5 border-amber-500/20' : 
                              'bg-emerald-500/5 border-emerald-500/10'
                            )}>
                              <div className="flex justify-between items-center">
                                <span className={cn(
                                  "font-bold flex items-center gap-1 px-2 py-0.5 rounded text-[10px]",
                                  log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400' : 
                                  log.level === 'WARN' ? 'bg-amber-500/20 text-amber-400' : 
                                  'bg-emerald-500/20 text-emerald-400'
                                )}>
                                  {log.level}
                                </span>
                                <span className="text-muted-foreground font-mono">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                              </div>
                              <p className="text-white font-semibold text-sm leading-tight">{log.message}</p>
                              {log.details && (
                                <div className="bg-black/40 p-3 rounded-lg text-muted-foreground font-mono text-[10px] whitespace-pre-wrap break-all border border-white/5 overflow-x-hidden">
                                  {log.details}
                                </div>
                              )}
                              <div className="text-[9px] text-muted-foreground uppercase tracking-widest pt-2 border-t border-white/5 flex justify-between">
                                <span>Bridge: {log.webhookId}</span>
                                <span className="opacity-50 font-mono">{log.id}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

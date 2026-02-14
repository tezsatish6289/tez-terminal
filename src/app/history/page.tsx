
"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History as HistoryIcon, Loader2, Lock, Terminal, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

export default function HistoryPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();

  const isAdmin = user?.email === "hello@tezterminal.com";

  // Debug Logs Query
  const logsQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return query(collection(firestore, "logs"), orderBy("timestamp", "desc"), limit(20));
  }, [firestore, isAdmin]);

  const { data: logs, isLoading: isLogsLoading } = useCollection(logsQuery);

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
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Activity Logs</h1>
              <p className="text-muted-foreground text-sm">Full audit trail of market signals and system events.</p>
            </div>
            <HistoryIcon className="h-8 w-8 text-accent opacity-20" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2 space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Signal Stream</CardTitle>
                </CardHeader>
                <CardContent>
                  <SignalHistory />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-card border-border border-dashed">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">System Debugger</CardTitle>
                    <CardDescription className="text-xs">Live ingestion diagnostics (Admin Only)</CardDescription>
                  </div>
                  <Terminal className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  {!isAdmin ? (
                    <div className="py-8 text-center">
                      <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                      <p className="text-xs text-muted-foreground">Log access restricted to admin.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {isLogsLoading ? (
                        <div className="h-20 animate-pulse bg-secondary/20 rounded-lg" />
                      ) : logs?.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No system logs yet.</p>
                      ) : (
                        logs?.map((log) => (
                          <div key={log.id} className="p-3 rounded-lg bg-secondary/30 border border-border/50 text-[10px] space-y-1">
                            <div className="flex justify-between items-center">
                              <span className={log.level === 'ERROR' ? 'text-rose-400 font-bold' : log.level === 'WARN' ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {log.level}
                              </span>
                              <span className="text-muted-foreground font-mono">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                            </div>
                            <p className="text-white font-medium">{log.message}</p>
                            {log.details && <p className="text-muted-foreground truncate italic">{log.details}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChromeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" x2="12" y1="8" y2="8" />
      <line x1="3.95" x2="8.54" y1="6.06" y2="14" />
      <line x1="10.88" x2="15.46" y1="21.94" y2="14" />
    </svg>
  );
}

"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Zap, Loader2, Rocket, ExternalLink, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ChromeIcon } from "@/components/icons";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const [origin, setOrigin] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const isWorkstation = origin.includes("workstations.dev") || origin.includes("cloudworkstations.dev");

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
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <div className="bg-primary p-4 rounded-2xl border border-accent/20 inline-block mx-auto mb-6">
              <Zap className="h-10 w-10 text-accent fill-accent/20" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tighter">TezTerminal</CardTitle>
            <CardDescription className="text-base mt-2">
              India's Premier Antigravity Trading Hub. 
              Sign in with Google to access the live signal stream.
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
                  <ChromeIcon className="h-6 w-6" />
                  Sign in with Google
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground px-6">
              Administrator login: <span className="text-accent font-mono">hello@tezterminal.com</span>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = user.email === 'hello@tezterminal.com';

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8">
          {isWorkstation && (
            <Card className="bg-amber-500/10 border-amber-500/30 overflow-hidden relative border-dashed">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Rocket className="h-20 w-20" />
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-amber-400 mb-1">
                  <Info className="h-5 w-5" />
                  <CardTitle className="text-lg">Editor Preview Active</CardTitle>
                </div>
                <CardDescription className="text-amber-200/70">
                  You are viewing the <strong>Private Preview</strong>. TradingView alerts will only work if sent to your <strong>Public URL</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-black/40 rounded-lg p-4 border border-amber-500/20">
                  <h4 className="text-sm font-bold text-white mb-2">Next Steps:</h4>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Find the Public URL in the output after clicking <strong>"Publish"</strong>.</li>
                    <li>Open that URL in a new tab to see your live Terminal.</li>
                    <li>Use the <strong>Bridge Management</strong> page on the public site to get your Webhook link.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 flex flex-col h-full space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">Market Overview</h1>
                  <p className="text-muted-foreground text-sm">Real-time TradingView analysis and signals.</p>
                </div>
              </div>
              
              <ChartPane />
            </div>

            <div className="lg:col-span-4 space-y-6">
               <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold mb-4 text-accent uppercase tracking-wider">Terminal Status</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Latency</span>
                      <span className="text-emerald-400 text-xs font-mono">12ms</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Node</span>
                      <span className="text-foreground text-xs font-mono">Lucknow-01</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="text-muted-foreground text-xs">Environment</span>
                      <span className={isWorkstation ? "text-amber-500 text-xs font-bold" : "text-emerald-400 text-xs font-bold"}>
                        {isWorkstation ? "Preview (Private)" : "Live (Public)"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-border">
                    <Link href="/webhooks" className="block w-full">
                      <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-6 rounded-lg shadow-lg shadow-accent/10">
                        {isAdmin ? 'Manage Global Bridges' : 'View Integration Guides'}
                      </Button>
                    </Link>
                  </div>
               </div>

               <div className="bg-primary/20 border border-accent/20 rounded-xl p-5 relative overflow-hidden group">
                  <h3 className="text-sm font-semibold mb-2 text-white">Lucknow Trading Hub</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Connected to low-latency Indian equity and global crypto alert nodes.
                  </p>
               </div>
            </div>
          </section>

          <section className="pb-8">
            <SignalHistory />
          </section>
        </div>
      </main>
      
      <Toaster />
    </div>
  );
}


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
import { Zap, ShieldAlert, Loader2 } from "lucide-react";

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();

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
            <div className="bg-primary p-3 rounded-xl border border-accent/20 inline-block mx-auto mb-4">
              <Zap className="h-8 w-8 text-accent fill-accent/20" />
            </div>
            <CardTitle className="text-2xl font-bold">TezTerminal Antigravity</CardTitle>
            <CardDescription>Professional trading signal hub. Please sign in with your Google account to access the terminal.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGoogleLogin} className="w-full h-12 gap-2 bg-white text-black hover:bg-white/90">
              <ChromeIcon className="h-5 w-5" />
              Sign in with Google
            </Button>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              By signing in, you agree to our Terms of Service.
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
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 flex flex-col h-full space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">Market Overview</h1>
                  <p className="text-muted-foreground text-sm">Real-time TradingView analysis and signals.</p>
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center gap-4 bg-secondary/30 p-1.5 rounded-lg border border-border">
                    <button className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-accent-foreground shadow-sm">Chart</button>
                    <button className="px-3 py-1 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground">Depth</button>
                    <button className="px-3 py-1 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground">Orderbook</button>
                  </div>
                </div>
              </div>
              
              <ChartPane />
            </div>

            <div className="lg:col-span-4 space-y-6">
               <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold mb-4 text-accent uppercase tracking-wider">Trading Quick-View</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Execution Speed</span>
                      <span className="text-emerald-400 text-xs font-mono">12ms</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Total Webhooks Today</span>
                      <span className="text-foreground text-xs font-mono">142</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Active Indicators</span>
                      <span className="text-foreground text-xs font-mono">8</span>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-border">
                    <Link href="/webhooks" className="block w-full">
                      <button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-accent/10">
                        {isAdmin ? 'Manage Global Bridges' : 'View Integration Details'}
                      </button>
                    </Link>
                  </div>
               </div>

               <div className="bg-primary/20 border border-accent/20 rounded-xl p-5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-accent/20 h-16 w-16 rounded-full blur-2xl group-hover:bg-accent/40 transition-all" />
                  <h3 className="text-sm font-semibold mb-2 text-white">Lucknow Trading Hub</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Connecting direct to TradingView alerts for ultra-low latency execution on India's premier trading terminal.
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

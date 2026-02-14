
"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { Toaster } from "@/components/ui/toaster";
import Link from "next/link";
import { useEffect } from "react";
import { useUser, useAuth, initiateAnonymousSignIn } from "@/firebase";

export default function Home() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  // Ensure user is authenticated even on the home page to listen for signals
  useEffect(() => {
    if (!isUserLoading && !user && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

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
                        Configure Webhook API
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


"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Zap, Loader2 } from "lucide-react";
import { ChromeIcon } from "@/components/icons";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeSignal, setActiveSignal] = useState<{ symbol: string; timeframe?: string; exchange?: string } | null>(null);

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
      <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl mx-auto mt-20">
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
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8">
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Market Overview</h1>
                <p className="text-muted-foreground text-sm">Real-time TradingView analysis for {activeSignal?.symbol || 'BTCUSDT'}.</p>
              </div>
            </div>
            
            <ChartPane 
              symbol={activeSignal?.symbol} 
              interval={activeSignal?.timeframe} 
              exchange={activeSignal?.exchange}
            />
          </section>

          <section className="pb-8">
            <SignalHistory onSignalSelect={setActiveSignal} />
          </section>
        </div>
      </main>
      
      <Toaster />
    </div>
  );
}

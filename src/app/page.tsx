
"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { Toaster } from "@/components/ui/toaster";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Zap, Loader2, Chrome, Lightbulb } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <div className="bg-primary p-4 rounded-2xl border border-accent/20 inline-block mx-auto mb-6">
              <Zap className="h-10 w-10 text-accent fill-accent/20" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tighter text-white">TezTerminal</CardTitle>
            <CardDescription className="text-base mt-2">
              India's Premier Antigravity Trading Hub. 
              Sign in with Google to access the live idea stream.
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
                  <Chrome className="h-6 w-6" />
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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />
        
        <div className="flex-1 flex min-h-0 divide-x divide-border">
          {/* Left Pane: Ideas */}
          <section className="w-[450px] flex flex-col bg-card/30">
            <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Lightbulb className="h-3 w-3 text-accent" />
                Idea Stream
              </h2>
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <SignalHistory onSignalSelect={setActiveSignal} />
            </div>
          </section>

          {/* Right Pane: Chart */}
          <section className="flex-1 flex flex-col bg-background p-2 relative">
             <div className="flex-1 rounded-xl overflow-hidden border border-border shadow-2xl">
                <ChartPane 
                  symbol={activeSignal?.symbol} 
                  interval={activeSignal?.timeframe} 
                  exchange={activeSignal?.exchange}
                />
             </div>
          </section>
        </div>
      </main>
      
      <Toaster />
    </div>
  );
}

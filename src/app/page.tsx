
"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
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
        
        <div className="flex-1 flex flex-col min-h-0">
          <section className="flex-1 flex flex-col bg-card/30 overflow-hidden">
            <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Lightbulb className="h-3 w-3 text-accent" />
                Live Performance Terminal
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground font-mono uppercase">Full Node Stream</span>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <SignalHistory />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

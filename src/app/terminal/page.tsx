"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth } from "@/firebase";
import { useSearchParams } from "next/navigation";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Zap, Loader2, Chrome, ChevronRight, Target } from "lucide-react";
import { useState, Suspense } from "react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  "5": "Scalping",
  "15": "Intraday",
  "60": "BTST",
  "240": "Swing",
  "D": "Buy & Hold",
};

const SIDE_LABELS: Record<string, string> = {
  "BUY": "Bulls",
  "SELL": "Bears",
};

const STATUS_LABELS: Record<string, string> = {
  "working": "Winning",
  "not-working": "Losing",
  "neutral": "Neutral",
  "all": "All Signals",
};

function TerminalContent() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const searchParams = useSearchParams();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const timeframe = searchParams.get("timeframe");
  const status = searchParams.get("status");
  const side = searchParams.get("side");

  const categoryLabel = timeframe ? CATEGORY_LABELS[timeframe] || timeframe : "All";
  const sideLabel = side ? SIDE_LABELS[side] || side : null;
  const statusLabel = status ? STATUS_LABELS[status] || status : null;

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
            <CardTitle className="text-3xl font-bold tracking-tighter text-foreground">TezTerminal</CardTitle>
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

        {/* Drill-down context header */}
        <div className="px-6 py-5 border-b border-white/5 bg-[#0a0a0c] shrink-0">
          <div className="flex items-center justify-between max-w-6xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Link href="/" className="text-accent hover:underline font-bold">Opportunities</Link>
                {sideLabel && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-black uppercase tracking-tight text-foreground">{categoryLabel}</span>
                  </>
                )}
                {sideLabel && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn("font-black uppercase tracking-tight", side === "BUY" ? "text-positive" : "text-negative")}>{sideLabel}</span>
                  </>
                )}
                {statusLabel && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn(
                      "font-black uppercase tracking-tight",
                      status === "working" ? "text-positive" : status === "not-working" ? "text-negative" : "text-foreground"
                    )}>{statusLabel}</span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Showing {sideLabel?.toLowerCase() || "all"} {categoryLabel?.toLowerCase()} opportunities{statusLabel ? ` that are ${statusLabel.toLowerCase()}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 relative">
          <section className="flex-1 flex flex-col bg-card/30 overflow-hidden">
            <div className="flex-1 min-h-0">
              <SignalHistory
                initialTimeframeTab={timeframe ?? undefined}
                initialPerformanceFilter={status ?? undefined}
                initialSideFilter={side ?? undefined}
                hideFilters
              />
            </div>
          </section>

          {/* Sticky bottom CTA */}
          <div className="sticky bottom-0 w-full border-t border-accent/20 bg-[#0a0a0c]/95 backdrop-blur-md py-4 px-6 z-30">
            <Link href="/" className="block max-w-md mx-auto">
              <Button className="w-full h-12 gap-3 bg-accent/15 text-accent border-2 border-accent/40 hover:bg-accent/25 font-black uppercase text-sm tracking-wider rounded-xl shadow-lg shadow-accent/10">
                <Target className="h-5 w-5" />
                Find More Opportunities
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>}>
      <TerminalContent />
    </Suspense>
  );
}

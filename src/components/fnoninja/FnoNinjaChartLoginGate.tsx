"use client";

import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FB_FULL_HEIGHT_MAIN } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaChartLoginGate({
  symbol,
  children,
}: {
  symbol?: string;
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    return (
      <main
        className={`${FB_FULL_HEIGHT_MAIN} flex items-center justify-center`}
        style={{ backgroundColor: "#060912" }}
      >
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: FNO_ACCENT }} />
      </main>
    );
  }

  if (user) return <>{children}</>;

  const headline = symbol ? `Unlock ${symbol} Analytics` : "Unlock Symbol Analytics";

  return (
    <main
      className={`${FB_FULL_HEIGHT_MAIN} flex flex-col items-center justify-center gap-6 px-6 text-center`}
      style={{ backgroundColor: "#060912" }}
    >
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{headline}</h1>
        <p className="text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
          Sign in with Google to get 1 month free access to option-chain zones, charts &amp; symbol
          analytics. Market Map is open to all.
        </p>
      </div>
      <FnoNinjaGoogleSignInButton size="hero" />
      <div className="max-w-sm space-y-1.5 text-[11px] leading-relaxed" style={{ color: "#475569" }}>
        <p>1 month free • Cancel anytime • No Credit Card required.</p>
        <p>Informational market data only. Not investment advice.</p>
      </div>
    </main>
  );
}

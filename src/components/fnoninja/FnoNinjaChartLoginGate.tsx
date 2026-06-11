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

  const headline = symbol
    ? `Sign in to view ${symbol} analytics`
    : "Sign in to view symbol analytics";

  return (
    <main
      className={`${FB_FULL_HEIGHT_MAIN} flex flex-col items-center justify-center gap-6 px-6 text-center`}
      style={{ backgroundColor: "#060912" }}
    >
      <div className="max-w-md space-y-3">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.2em] font-mono"
          style={{ color: FNO_ACCENT }}
        >
          Members only
        </p>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{headline}</h1>
        <p className="text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
          Create a free account or sign in with Google to access option-chain derived zones,
          charts, and symbol-level analytics. The market map remains open without an account.
        </p>
      </div>
      <FnoNinjaGoogleSignInButton size="hero" />
      <p className="text-[11px] max-w-sm" style={{ color: "#475569" }}>
        Informational market data only. Not investment advice.
      </p>
    </main>
  );
}

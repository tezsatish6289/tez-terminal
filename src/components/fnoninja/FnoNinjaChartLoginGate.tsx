"use client";

import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FB_FULL_HEIGHT_MAIN } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_APP_SURFACE_STYLE, FNO_MUTED } from "@/lib/fnoninja/theme";

const DEFAULT_DESCRIPTION =
  "Sign in with Google to get 1 month free access to option-chain zones, charts & symbol analytics. Market Map is open to all.";

export function FnoNinjaChartLoginGate({
  symbol,
  headline,
  description = DEFAULT_DESCRIPTION,
  backAction,
  children,
}: {
  symbol?: string;
  headline?: string;
  description?: string;
  /** Lets gated views (e.g. liveslide) return to the public market map without signing in. */
  backAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    return (
      <main
        className={`${FB_FULL_HEIGHT_MAIN} flex items-center justify-center`}
        style={FNO_APP_SURFACE_STYLE}
      >
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: FNO_ACCENT }} />
      </main>
    );
  }

  if (user) return <>{children}</>;

  const resolvedHeadline =
    headline ?? (symbol ? `Unlock ${symbol} Analytics` : "Unlock Symbol Analytics");

  return (
    <main
      className={`${FB_FULL_HEIGHT_MAIN} flex flex-col items-center justify-center gap-6 px-6 text-center`}
      style={FNO_APP_SURFACE_STYLE}
    >
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {resolvedHeadline}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
          {description}
        </p>
      </div>
      <FnoNinjaGoogleSignInButton size="hero" />
      {backAction ? (
        <button
          type="button"
          onClick={backAction.onClick}
          className="text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: FNO_MUTED }}
        >
          {backAction.label}
        </button>
      ) : null}
      <div className="max-w-sm space-y-1.5 text-[11px] leading-relaxed" style={{ color: "#475569" }}>
        <p>1 month free • Cancel anytime • No Credit Card required.</p>
        <p>Informational market data only. Not investment advice.</p>
      </div>
    </main>
  );
}

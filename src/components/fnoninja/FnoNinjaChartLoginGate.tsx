"use client";

import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FB_FULL_HEIGHT_MAIN } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_APP_SURFACE_STYLE, FNO_MUTED } from "@/lib/fnoninja/theme";

const DEFAULT_DESCRIPTION =
  "Sign in with Google to get 1 month free access to option-chain zones, charts & symbol analytics. Market Map is open to all.";

function FnoNinjaLoginShimmerOverlay({
  backAction,
}: {
  backAction?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in required"
    >
      {/* Very subtle dim — page content stays visible underneath */}
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(8, 15, 30, 0.28)" }} />

      {/* Shimmer sweep */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute inset-y-0 w-[55%] animate-fno-shimmer-sweep"
          style={{
            background:
              "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.025) 45%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.025) 55%, transparent 100%)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 px-6 pointer-events-auto">
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
      </div>
    </div>
  );
}

export function FnoNinjaChartLoginGate({
  symbol,
  headline,
  description = DEFAULT_DESCRIPTION,
  backAction,
  overlay = false,
  children,
}: {
  symbol?: string;
  headline?: string;
  description?: string;
  /** Lets gated views (e.g. liveslide) return to the public market map without signing in. */
  backAction?: { label: string; onClick: () => void };
  /** Show children behind a shimmer overlay with centered sign-in (slideshow modes). */
  overlay?: boolean;
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();

  if (isUserLoading) {
    if (overlay) {
      return (
        <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
          <div className="flex flex-1 min-h-0 flex-col pointer-events-none select-none opacity-90">
            {children}
          </div>
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: FNO_ACCENT }} />
          </div>
        </div>
      );
    }
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

  if (overlay) {
    return (
      <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0 flex-col pointer-events-none select-none">{children}</div>
        <FnoNinjaLoginShimmerOverlay backAction={backAction} />
      </div>
    );
  }

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

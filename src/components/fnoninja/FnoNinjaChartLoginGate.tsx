"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { trackCtaClick } from "@/firebase/analytics";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FB_FULL_HEIGHT_MAIN } from "@/lib/freedombot/responsive";
import {
  FNO_LOGIN_DISCLAIMER,
  FNO_LOGIN_GATE_DESCRIPTION,
  FNO_MARKET_MAP_GUEST_DESCRIPTION,
  FNO_MARKET_MAP_GUEST_HEADLINE,
  FNO_TOOLBAR_SIGN_IN_COPY,
  type FnoToolbarSignInAction,
} from "@/lib/fnoninja/login-copy";
import { FNO_MOBILE_SLIDE_BODY_MIN_CLASS } from "@/lib/fnoninja/responsive";
import {
  FNO_ACCENT,
  FNO_APP_SURFACE_STYLE,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

const DEFAULT_DESCRIPTION = FNO_LOGIN_GATE_DESCRIPTION;

/** Google OAuth in-place — no redirect to /login (avoids a redundant second sign-in screen). */
function FnoNinjaLoginCta({
  className = "",
  compact = false,
  onSignedIn,
  ctaId = "chart_gate_sign_in",
}: {
  className?: string;
  compact?: boolean;
  onSignedIn?: () => void;
  ctaId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo =
    searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

  return (
    <FnoNinjaGoogleSignInButton
      className={`w-full ${className}`.trim()}
      size={compact ? "nav" : "hero"}
      ctaId={ctaId}
      postSignInHref={returnTo}
      onSignedIn={onSignedIn}
    />
  );
}

function FnoNinjaLoginShimmerOverlay({
  backAction,
  fixed = false,
}: {
  backAction?: { label: string; onClick: () => void };
  /** Fixed overlay — does not depend on parent flex height (mobile liveslide preview). */
  fixed?: boolean;
}) {
  return (
    <div
      className={
        fixed
          ? "fixed inset-0 z-[180] flex items-center justify-center px-6"
          : "absolute inset-0 z-20 flex items-center justify-center"
      }
      role="dialog"
      aria-modal="true"
      aria-label="Sign in required"
    >
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(8, 15, 30, 0.28)" }} />

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
        <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_MUTED }} />}>
          <FnoNinjaLoginCta />
        </Suspense>
        {backAction ? (
          <button
            type="button"
            onClick={() => {
              trackCtaClick("chart_gate_back", { label: backAction.label });
              backAction.onClick();
            }}
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

const GUEST_SIGNIN_NUDGE_CSS = `
@keyframes fno-guest-signin-nudge {
  0%, 100% {
    transform: translateX(0) rotate(0deg) scale(1);
    box-shadow: 0 16px 48px rgba(0,0,0,0.55);
    border-color: rgba(255,255,255,0.14);
    filter: brightness(1);
  }
  12% { transform: translateX(-4px) rotate(-0.75deg) scale(1.008); }
  24% { transform: translateX(4px) rotate(0.75deg) scale(1.012); }
  38% {
    transform: translateX(-2px) rotate(-0.4deg) scale(1.018);
    box-shadow:
      0 22px 60px rgba(0,0,0,0.65),
      0 0 36px rgba(96,165,250,0.55),
      0 0 72px rgba(59,130,246,0.32),
      0 0 110px rgba(37,99,235,0.18),
      inset 0 0 24px rgba(96,165,250,0.12);
    border-color: rgba(147,197,253,0.72);
    filter: brightness(1.1);
  }
  52% {
    transform: translateX(2px) rotate(0.4deg) scale(1.014);
    box-shadow:
      0 20px 56px rgba(0,0,0,0.62),
      0 0 44px rgba(96,165,250,0.48),
      0 0 80px rgba(59,130,246,0.26),
      inset 0 0 18px rgba(96,165,250,0.1);
    border-color: rgba(147,197,253,0.58);
    filter: brightness(1.06);
  }
  68% {
    transform: translateX(-1px) rotate(-0.15deg) scale(1.006);
    box-shadow:
      0 18px 52px rgba(0,0,0,0.58),
      0 0 24px rgba(96,165,250,0.28),
      0 0 48px rgba(59,130,246,0.14);
    border-color: rgba(147,197,253,0.42);
    filter: brightness(1.03);
  }
}
.fno-guest-signin-nudge {
  animation: fno-guest-signin-nudge 1.35s cubic-bezier(0.45, 0, 0.55, 1) forwards;
}
`;

/** Market map preview for signed-out users — fixed bottom-right card (portaled, never clipped). */
export function FnoNinjaMarketMapGuestGate({ nudgeKey = 0 }: { nudgeKey?: number }) {
  const [mounted, setMounted] = useState(false);
  const [nudging, setNudging] = useState(false);
  const lastNudgeKeyRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || nudgeKey <= 0 || nudgeKey === lastNudgeKeyRef.current) return;
    lastNudgeKeyRef.current = nudgeKey;
    setNudging(true);
    const t = window.setTimeout(() => setNudging(false), 1400);
    return () => window.clearTimeout(t);
  }, [mounted, nudgeKey]);

  if (!mounted) return null;

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: GUEST_SIGNIN_NUDGE_CSS }} />
      <div
        className="fixed z-[220] pointer-events-none left-0 right-0 bottom-0 top-14 sm:top-16"
        role="dialog"
        aria-modal="true"
        aria-label={FNO_MARKET_MAP_GUEST_HEADLINE}
      >
        <div
          className={`absolute bottom-4 right-4 sm:bottom-5 sm:right-5 w-[min(17rem,calc(100vw-2rem))] rounded-xl border px-4 py-3.5 shadow-2xl pointer-events-auto ${
            nudging ? "fno-guest-signin-nudge" : ""
          }`}
          style={{
            backgroundColor: "#0f172a",
            borderColor: "rgba(255,255,255,0.14)",
            ...(nudging ? {} : { boxShadow: "0 16px 48px rgba(0,0,0,0.55)" }),
          }}
        >
        <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: FNO_MUTED }}>
          Live preview
        </p>
        <h2 className="mt-1 text-sm font-black text-white leading-snug tracking-tight">
          {FNO_MARKET_MAP_GUEST_HEADLINE}
        </h2>
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>
          {FNO_MARKET_MAP_GUEST_DESCRIPTION}
        </p>
        <div className="mt-3">
          <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin mx-auto" style={{ color: FNO_MUTED }} />}>
            <FnoNinjaLoginCta compact ctaId="market_map_guest_sign_in" />
          </Suspense>
        </div>
        <p className="mt-2.5 text-[9px] leading-relaxed" style={{ color: "#64748b" }}>
          {FNO_LOGIN_DISCLAIMER}
        </p>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Compact sign-in card beside the chart toolbar — chart stays fully visible. */
export function FnoNinjaToolbarSignInPrompt({
  open,
  action,
  onDismiss,
  onSignedIn,
}: {
  open: boolean;
  action: FnoToolbarSignInAction | null;
  /** User cancelled — clear any pending gated action. */
  onDismiss: () => void;
  /** OAuth finished — hide prompt; caller may run the pending action when auth state updates. */
  onSignedIn?: () => void;
}) {
  if (!open || !action) return null;

  const copy = FNO_TOOLBAR_SIGN_IN_COPY[action];

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[190] cursor-default bg-transparent"
        aria-label="Dismiss sign-in prompt"
        onClick={onDismiss}
      />
      <div
        className="fixed z-[200] left-[4.75rem] top-1/2 w-[min(calc(100vw-5.5rem),18rem)] -translate-y-1/2 rounded-xl border px-4 py-3.5 shadow-2xl"
        style={{
          backgroundColor: "rgba(15,23,42,0.98)",
          borderColor: "rgba(255,255,255,0.12)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
      >
        <p className="text-[13px] font-bold text-white leading-snug">{copy.title}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: FNO_MUTED }}>
          {copy.description}
        </p>
        <div className="mt-3">
          <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin mx-auto" style={{ color: FNO_MUTED }} />}>
            <FnoNinjaLoginCta compact onSignedIn={onSignedIn ?? onDismiss} />
          </Suspense>
        </div>
        <p className="mt-2.5 text-[9px] leading-relaxed text-center" style={{ color: "#475569" }}>
          {FNO_LOGIN_DISCLAIMER}
        </p>
      </div>
    </>
  );
}

/** @deprecated Use {@link FnoNinjaToolbarSignInPrompt} — kept for any legacy callers. */
export function FnoNinjaSignInOverlay({
  open,
  onClose,
  action = "chat",
}: {
  open: boolean;
  onClose: () => void;
  action?: FnoToolbarSignInAction;
}) {
  return (
    <FnoNinjaToolbarSignInPrompt
      open={open}
      action={open ? action : null}
      onDismiss={onClose}
      onSignedIn={onClose}
    />
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

  if (user) return <>{children}</>;

  if (isUserLoading) {
    if (overlay) {
      return (
        <div
          className={`relative flex flex-1 min-h-0 w-full flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden ${FNO_MOBILE_SLIDE_BODY_MIN_CLASS}`}
        >
          <div className="flex flex-1 min-h-0 flex-col max-md:flex-none max-md:overflow-visible pointer-events-none select-none opacity-90">
            {children}
          </div>
          <div className="fixed inset-0 z-[180] flex items-center justify-center">
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

  if (overlay) {
    return (
      <>
        <div
          className={`flex flex-1 min-h-0 w-full flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden pointer-events-none select-none ${FNO_MOBILE_SLIDE_BODY_MIN_CLASS}`}
        >
          {children}
        </div>
        <FnoNinjaLoginShimmerOverlay backAction={backAction} fixed />
      </>
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
      <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_MUTED }} />}>
        <FnoNinjaLoginCta />
      </Suspense>
      {backAction ? (
        <button
          type="button"
          onClick={() => {
            trackCtaClick("chart_gate_back", { label: backAction.label });
            backAction.onClick();
          }}
          className="text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: FNO_MUTED }}
        >
          {backAction.label}
        </button>
      ) : null}
      <p className="max-w-sm text-[11px] leading-relaxed" style={{ color: "#475569" }}>
        {FNO_LOGIN_DISCLAIMER}
      </p>
    </main>
  );
}

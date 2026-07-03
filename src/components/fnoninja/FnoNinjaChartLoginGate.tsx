"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { FB_FULL_HEIGHT_MAIN } from "@/lib/freedombot/responsive";
import {
  FNO_LOGIN_DISCLAIMER,
  FNO_LOGIN_GATE_DESCRIPTION,
} from "@/lib/fnoninja/login-copy";
import { fnoLoginHref } from "@/lib/fnoninja/paths";
import { FNO_MOBILE_SLIDE_BODY_MIN_CLASS } from "@/lib/fnoninja/responsive";
import {
  FNO_ACCENT,
  FNO_APP_SURFACE_STYLE,
  FNO_CTA_GRADIENT,
  FNO_CTA_SHADOW,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

const DEFAULT_DESCRIPTION = FNO_LOGIN_GATE_DESCRIPTION;

const LOGIN_BTN_CLASS =
  "inline-flex items-center justify-center font-bold text-white transition-all hover:scale-[1.02] gap-2.5 rounded-xl px-8 py-3.5 text-sm";

function FnoNinjaLoginCta({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo =
    searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
  const loginHref = fnoLoginHref(pathname, returnTo);

  return (
    <Link
      href={loginHref}
      className={`${LOGIN_BTN_CLASS} ${className}`}
      style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
    >
      Sign in with Google
    </Link>
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
          onClick={backAction.onClick}
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

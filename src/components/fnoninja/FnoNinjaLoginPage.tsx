"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { FnoNinjaLogo } from "@/components/fnoninja/FnoNinjaLogo";
import { useUser } from "@/firebase";
import {
  fnoAnalyticsHref,
  fnoHomeHref,
  fnoLoginHref,
  resolveFnoLoginNext,
} from "@/lib/fnoninja/paths";
import { setFnoPostLoginRedirect } from "@/lib/fnoninja/post-login-redirect";
import { FB_COMPACT_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_CARD_BG,
  FNO_CARD_BORDER,
  FNO_GRADIENT_TEXT,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

function FnoNinjaLoginPageInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useUser();
  const returnTo = resolveFnoLoginNext(searchParams, pathname);

  useEffect(() => {
    setFnoPostLoginRedirect(returnTo);
  }, [returnTo]);

  useEffect(() => {
    if (isUserLoading || !user) return;
    router.replace(returnTo);
  }, [user, isUserLoading, returnTo, router]);

  if (isUserLoading || user) {
    return (
      <main className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
      </main>
    );
  }

  return (
    <main
      className={`${FB_COMPACT_SHELL} flex flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24`}
    >
      <div
        className="w-full max-w-md rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-center"
        style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
      >
        <div className="flex justify-center mb-8">
          <FnoNinjaLogo size={40} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
          Sign in to{" "}
          <span className="uppercase" style={FNO_GRADIENT_TEXT}>
            FNONINJA
          </span>
        </h1>

        <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          1 month free on us — full access to symbol charts, liveslide, and deep-dive analytics.
          No credit card required.
        </p>

        <div className="mt-8">
          <FnoNinjaGoogleSignInButton
            className="w-full"
            size="hero"
            postSignInHref={returnTo}
            onSignedIn={() => router.replace(returnTo)}
          />
        </div>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: "#475569" }}>
          Informational market data only · Not investment advice
        </p>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 text-sm">
        <Link
          href={fnoAnalyticsHref(pathname)}
          className="font-semibold transition-colors hover:text-white"
          style={{ color: FNO_MUTED }}
        >
          Explore market map without signing in
        </Link>
        <span className="hidden sm:inline text-white/20" aria-hidden>
          ·
        </span>
        <Link
          href={fnoHomeHref(pathname)}
          className="font-semibold transition-colors hover:text-white"
          style={{ color: FNO_MUTED }}
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="flex flex-1 items-center justify-center py-24">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
    </main>
  );
}

/** Dedicated sign-in surface — Google OAuth with optional ?next= return path. */
export function FnoNinjaLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <FnoNinjaLoginPageInner />
    </Suspense>
  );
}

/** Build login URL for the current page (used by gates and CTAs). */
export function useFnoLoginHref(returnTo?: string): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullReturn =
    returnTo ??
    (searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname);
  return fnoLoginHref(pathname, fullReturn);
}

export function FnoNinjaLoginLink({
  className = "",
  children,
  returnTo,
}: {
  className?: string;
  children: React.ReactNode;
  returnTo?: string;
}) {
  return (
    <Suspense fallback={null}>
      <FnoNinjaLoginLinkInner className={className} returnTo={returnTo}>
        {children}
      </FnoNinjaLoginLinkInner>
    </Suspense>
  );
}

function FnoNinjaLoginLinkInner({
  className,
  children,
  returnTo,
}: {
  className?: string;
  children: React.ReactNode;
  returnTo?: string;
}) {
  const href = useFnoLoginHref(returnTo);
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

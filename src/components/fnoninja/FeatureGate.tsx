"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Crown, Loader2, Lock } from "lucide-react";
import { FnoNinjaGoogleSignInButton } from "@/components/fnoninja/FnoNinjaGoogleSignInButton";
import { useEntitlements } from "@/hooks/use-entitlements";
import type { Feature, LockReason } from "@/lib/entitlements";
import { fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW, FNO_MUTED } from "@/lib/fnoninja/theme";

const LOCK_COPY: Record<LockReason, { title: string; body: string; cta: string }> = {
  login_required: {
    title: "Sign in to continue",
    body: "Sign in with Google to unlock this feature and start your 7-day free trial.",
    cta: "sign_in",
  },
  subscription_required: {
    title: "Your access has expired",
    body: "Pick a plan to keep using this feature.",
    cta: "view_plans",
  },
  upgrade_required: {
    title: "A Gold feature",
    body: "Atlas AI, FavSlide and LiveSlide are included with Gold and the Day Pass. Upgrade to unlock.",
    cta: "upgrade",
  },
};

/**
 * Card shown when a feature is locked. Renders the right call-to-action for the
 * reason (sign in / subscribe / upgrade).
 */
export function FeatureLockCard({
  reason,
  compact = false,
}: {
  reason: LockReason;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const copy = LOCK_COPY[reason];
  const Icon = reason === "upgrade_required" ? Crown : Lock;
  const returnTo =
    searchParams && searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 text-center ${
        compact ? "px-5 py-6" : "px-6 py-10"
      }`}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(37,99,235,0.12)" }}
      >
        <Icon className="h-5 w-5" style={{ color: "#60a5fa" }} />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-bold text-white">{copy.title}</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: FNO_MUTED }}>
          {copy.body}
        </p>
      </div>

      {reason === "login_required" ? (
        <Suspense
          fallback={<Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_MUTED }} />}
        >
          <FnoNinjaGoogleSignInButton
            size="nav"
            ctaId="feature_gate_sign_in"
            postSignInHref={returnTo}
          />
        </Suspense>
      ) : (
        <Link
          href={fnoSubscribeHref(pathname)}
          className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-xs font-bold text-white transition-transform hover:scale-105"
          style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
        >
          {reason === "upgrade_required" ? "Upgrade to Gold" : "View plans"}
        </Link>
      )}
    </div>
  );
}

/**
 * Gates its children behind a feature entitlement. When locked, renders `fallback`
 * (or a default {@link FeatureLockCard}). While auth/subscription is still
 * resolving, renders `loading` (default: nothing) to avoid flashing gated content.
 */
export function FeatureGate({
  feature,
  children,
  fallback,
  loading = null,
  compact = false,
}: {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
  compact?: boolean;
}) {
  const { has, lockReason, isLoading } = useEntitlements();

  if (isLoading) return <>{loading}</>;
  if (has(feature)) return <>{children}</>;

  const reason = lockReason(feature) ?? "subscription_required";
  return <>{fallback ?? <FeatureLockCard reason={reason} compact={compact} />}</>;
}

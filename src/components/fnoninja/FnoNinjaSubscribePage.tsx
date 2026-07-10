"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useUser } from "@/firebase";
import { useSubscription } from "@/hooks/use-subscription";
import { toast } from "@/hooks/use-toast";
import { fnoLoginHref } from "@/lib/fnoninja/paths";
import { formatInr } from "@/lib/fnoninja/pricing";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

const FNO_BORDER = "rgba(90,140,220,0.2)";

type CheckoutTier = "silver" | "gold" | "daypass";

interface PlanCard {
  tier: CheckoutTier;
  label: string;
  priceInr: number;
  periodLabel: string;
  tagline: string;
  badge?: string;
  highlight?: boolean;
  features: string[];
  note?: string;
}

const COMMON_FEATURES = [
  "Bubble market map",
  "Trend, Intraday, Outlook & History charts",
  "Sentiment & News",
  "Favourites",
  "Community chat",
];

const PREMIUM_FEATURES = ["Atlas AI", "FavSlide", "LiveSlide"];

const PLANS: PlanCard[] = [
  {
    tier: "silver",
    label: "Silver",
    priceInr: 4500,
    periodLabel: "6 months",
    tagline: "Core analytics for focused swing traders.",
    features: COMMON_FEATURES,
    note: "Does not include Atlas AI, FavSlide or LiveSlide.",
  },
  {
    tier: "gold",
    label: "Gold",
    priceInr: 7200,
    periodLabel: "12 months",
    tagline: "Everything, all year. Best value.",
    badge: "Best value",
    highlight: true,
    features: [...COMMON_FEATURES, ...PREMIUM_FEATURES],
  },
  {
    tier: "daypass",
    label: "Day Pass",
    priceInr: 99,
    periodLabel: "24 hours",
    tagline: "Full access for a day — no commitment.",
    badge: "One-time",
    features: [...COMMON_FEATURES, ...PREMIUM_FEATURES],
  },
];

function SubscribeInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useUser();
  const sub = useSubscription(
    user?.uid,
    user ? { name: user.displayName, email: user.email, photo: user.photoURL } : undefined,
  );

  const [loadingTier, setLoadingTier] = useState<CheckoutTier | null>(null);

  useEffect(() => {
    if (searchParams.get("status") === "success") {
      toast({
        title: "Payment successful",
        description: "Your subscription is being activated. It may take a few moments to reflect.",
      });
      sub.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSubscribe(tier: CheckoutTier) {
    if (!user) return;
    setLoadingTier(tier);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscription/zoho/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout");
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast({
        title: "Checkout failed",
        description: e.message || "Please try again in a moment.",
        variant: "destructive",
      });
      setLoadingTier(null);
    }
  }

  const signedIn = !!user && !isUserLoading;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div
          className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300"
          style={{ borderColor: FNO_BORDER }}
        >
          <Sparkles className="h-3 w-3 text-[#60a5fa]" />
          Membership
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Choose your plan
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Charts and Sentiment are free to explore. Sign in for your 7-day free trial, then pick a
          plan to keep full access.
        </p>
      </div>

      {/* Current status banner */}
      {signedIn && !sub.isLoading ? <StatusBanner sub={sub} /> : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {PLANS.map((plan) => {
          const isCurrent = signedIn && sub.isActive && sub.tier === plan.tier;
          return (
            <article
              key={plan.tier}
              className={`relative flex h-full flex-col rounded-2xl p-6 sm:p-7 ${
                plan.highlight
                  ? "border border-[#3b82f6]/40 bg-gradient-to-b from-[#3b82f6]/[0.14] via-[#0b1428] to-[#0a1120] shadow-[0_20px_60px_-20px_rgba(59,130,246,0.4)]"
                  : ""
              }`}
              style={
                plan.highlight
                  ? undefined
                  : { border: `1px solid ${FNO_BORDER}`, backgroundColor: "#0d1830" }
              }
            >
              <div className="mb-5 flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {plan.label}
                </p>
                {plan.badge ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                      plan.highlight ? "bg-[#3b82f6] text-white" : "border bg-[#0d1830] text-slate-400"
                    }`}
                    style={{ borderColor: plan.highlight ? "transparent" : FNO_BORDER }}
                  >
                    {plan.badge}
                  </span>
                ) : null}
              </div>

              <div className="mb-2">
                <p className="text-3xl font-black leading-none text-white sm:text-4xl">
                  {formatInr(plan.priceInr)}
                </p>
                <p className="mt-2 text-xs text-slate-500">{plan.periodLabel}</p>
              </div>
              <p className="mb-5 text-[13px] leading-relaxed text-slate-400">{plan.tagline}</p>

              <ul className="mb-6 flex-1 space-y-2.5 text-[13px] leading-relaxed text-slate-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: plan.highlight ? "#60a5fa" : "#3b82f6" }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.note ? (
                <p className="mb-4 text-[11px] leading-relaxed text-slate-500">{plan.note}</p>
              ) : null}

              {!signedIn ? (
                <Link
                  href={fnoLoginHref(pathname, `${pathname}`)}
                  className="inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
                  style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
                >
                  Sign in to subscribe
                </Link>
              ) : isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-default rounded-xl border py-3 text-sm font-bold text-slate-300"
                  style={{ borderColor: FNO_BORDER }}
                >
                  Current plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubscribe(plan.tier)}
                  disabled={loadingTier !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                  style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
                >
                  {loadingTier === plan.tier ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
                    </>
                  ) : (
                    <>Get {plan.label}</>
                  )}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <p className="mx-auto mt-8 max-w-lg text-center text-[11px] leading-relaxed text-slate-500">
        Secure payments via Razorpay, managed by Zoho Billing. Silver &amp; Gold auto-renew; cancel
        anytime. Day Pass is a one-time purchase. Informational data only — not investment advice.
      </p>
    </div>
  );
}

function StatusBanner({ sub }: { sub: ReturnType<typeof useSubscription> }) {
  if (sub.status === "loading") return null;

  let message: string;
  if (sub.isTrial) {
    message = sub.showHours
      ? `Free trial — ${sub.hoursRemaining} hour${sub.hoursRemaining === 1 ? "" : "s"} left`
      : `Free trial — ${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"} left`;
  } else if (sub.isActive && sub.tier) {
    const tierName = sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1);
    message = sub.showHours
      ? `${tierName} active — ${sub.hoursRemaining} hour${sub.hoursRemaining === 1 ? "" : "s"} left`
      : `${tierName} active — ${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"} left`;
  } else {
    message = "Your access has expired — pick a plan below to continue.";
  }

  return (
    <div
      className="mx-auto mt-8 max-w-xl rounded-xl border px-4 py-3 text-center text-sm text-slate-200"
      style={{ borderColor: FNO_BORDER, backgroundColor: "#0d1830" }}
    >
      {message}
    </div>
  );
}

export function FnoNinjaSubscribePage() {
  return (
    <Suspense fallback={null}>
      <SubscribeInner />
    </Suspense>
  );
}

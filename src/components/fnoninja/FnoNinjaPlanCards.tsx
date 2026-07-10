"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { useSubscription } from "@/hooks/use-subscription";
import { toast } from "@/hooks/use-toast";
import { fnoAnalyticsHref, fnoLoginHref, fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { formatInr } from "@/lib/fnoninja/pricing";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";

const FNO_BORDER = "rgba(90,140,220,0.2)";

type CheckoutTier = "silver" | "gold" | "daypass";

const COMMON_FEATURES = [
  "Bubble market map",
  "Trend, Intraday, Outlook & History charts",
  "Sentiment & News",
  "Favourites",
  "Community chat",
];

const PREMIUM_FEATURES = ["Atlas AI", "FavSlide", "LiveSlide"];

type PrimaryCard =
  | {
      kind: "trial";
      label: string;
      periodLabel: string;
      tagline: string;
      badge?: string;
      highlight?: boolean;
      features: string[];
    }
  | {
      kind: "checkout";
      tier: "silver" | "gold";
      label: string;
      priceInr: number;
      periodLabel: string;
      tagline: string;
      badge?: string;
      highlight?: boolean;
      features: string[];
      note?: string;
    };

const PRIMARY_CARDS: PrimaryCard[] = [
  {
    kind: "trial",
    label: "Free trial",
    periodLabel: "7 days",
    tagline: "Try everything, free for a week.",
    badge: "Start here",
    features: ["Full access to every feature", "No credit card required", "Cancel anytime"],
  },
  {
    kind: "checkout",
    tier: "silver",
    label: "Silver",
    priceInr: 4500,
    periodLabel: "6 months",
    tagline: "Core analytics for focused swing traders.",
    features: COMMON_FEATURES,
    note: "Does not include Atlas AI, FavSlide or LiveSlide.",
  },
  {
    kind: "checkout",
    tier: "gold",
    label: "Gold",
    priceInr: 7200,
    periodLabel: "12 months",
    tagline: "Everything, all year. Best value.",
    badge: "Best value",
    highlight: true,
    features: [...COMMON_FEATURES, ...PREMIUM_FEATURES],
  },
];

function PlanCardsInner({ showStatusBanner }: { showStatusBanner: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useUser();
  const sub = useSubscription(
    user?.uid,
    user ? { name: user.displayName, email: user.email, photo: user.photoURL } : undefined,
  );

  const [loadingTier, setLoadingTier] = useState<CheckoutTier | null>(null);
  const autoFired = useRef(false);

  const signedIn = !!user && !isUserLoading;

  async function handleSubscribe(tier: CheckoutTier) {
    if (!user) return;
    setLoadingTier(tier);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscription/zoho/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout");
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

  // Post-checkout success toast (redirect back with ?status=success).
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

  // Continue checkout after login: ?checkout=<tier> auto-starts once signed in.
  useEffect(() => {
    const c = searchParams.get("checkout");
    if (!c || autoFired.current || !signedIn) return;
    if (c !== "silver" && c !== "gold" && c !== "daypass") return;
    autoFired.current = true;
    void handleSubscribe(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, signedIn]);

  // Login destination that resumes the chosen action after OAuth.
  const loginForCheckout = (tier: CheckoutTier) =>
    fnoLoginHref(pathname, `${fnoSubscribeHref(pathname)}?checkout=${tier}`);
  const loginForTrial = () => fnoLoginHref(pathname, fnoAnalyticsHref(pathname));

  function renderCta(card: PrimaryCard) {
    const gradientBtn =
      "inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60";
    const outlineBtn =
      "w-full cursor-default rounded-xl border py-3 text-center text-sm font-bold text-slate-300";

    if (card.kind === "trial") {
      if (!signedIn) {
        return (
          <Link href={loginForTrial()} className={gradientBtn} style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}>
            Select
          </Link>
        );
      }
      if (sub.isTrial) {
        return (
          <span className={outlineBtn} style={{ borderColor: FNO_BORDER }}>
            Current plan
          </span>
        );
      }
      return (
        <Link href={fnoAnalyticsHref(pathname)} className={gradientBtn} style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}>
          Open app
        </Link>
      );
    }

    // Paid card (silver / gold)
    const isCurrent = signedIn && sub.isActive && sub.tier === card.tier;
    if (!signedIn) {
      return (
        <Link href={loginForCheckout(card.tier)} className={gradientBtn} style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}>
          Select
        </Link>
      );
    }
    if (isCurrent) {
      return (
        <span className={outlineBtn} style={{ borderColor: FNO_BORDER }}>
          Current plan
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleSubscribe(card.tier)}
        disabled={loadingTier !== null}
        className={gradientBtn}
        style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
      >
        {loadingTier === card.tier ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
          </>
        ) : (
          "Select"
        )}
      </button>
    );
  }

  return (
    <>
      {showStatusBanner && signedIn && !sub.isLoading ? <StatusBanner sub={sub} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {PRIMARY_CARDS.map((card) => (
          <article
            key={card.label}
            className={`relative flex h-full flex-col rounded-2xl p-6 sm:p-7 ${
              card.highlight
                ? "border border-[#3b82f6]/40 bg-gradient-to-b from-[#3b82f6]/[0.14] via-[#0b1428] to-[#0a1120] shadow-[0_20px_60px_-20px_rgba(59,130,246,0.4)]"
                : ""
            }`}
            style={card.highlight ? undefined : { border: `1px solid ${FNO_BORDER}`, backgroundColor: "#0d1830" }}
          >
            <div className="mb-5 flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{card.label}</p>
              {card.badge ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                    card.highlight ? "bg-[#3b82f6] text-white" : "border bg-[#0d1830] text-slate-400"
                  }`}
                  style={{ borderColor: card.highlight ? "transparent" : FNO_BORDER }}
                >
                  {card.badge}
                </span>
              ) : null}
            </div>

            <div className="mb-2">
              {card.kind === "trial" ? (
                <p className="text-3xl font-black leading-none text-white sm:text-4xl">Free</p>
              ) : (
                <p className="text-3xl font-black leading-none text-white sm:text-4xl">{formatInr(card.priceInr)}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {card.kind === "trial" ? `${card.periodLabel} · no credit card` : card.periodLabel}
              </p>
            </div>
            <p className="mb-5 text-[13px] leading-relaxed text-slate-400">{card.tagline}</p>

            <ul className="mb-6 flex-1 space-y-2.5 text-[13px] leading-relaxed text-slate-300">
              {card.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: card.highlight ? "#60a5fa" : "#3b82f6" }} />
                  {f}
                </li>
              ))}
            </ul>

            {card.kind === "checkout" && card.note ? (
              <p className="mb-4 text-[11px] leading-relaxed text-slate-500">{card.note}</p>
            ) : null}

            {renderCta(card)}
          </article>
        ))}
      </div>

      <DayPassCallout
        signedIn={signedIn}
        loading={loadingTier === "daypass"}
        disabled={loadingTier !== null}
        onSelect={() => handleSubscribe("daypass")}
        loginHref={loginForCheckout("daypass")}
      />
    </>
  );
}

function DayPassCallout({
  signedIn,
  loading,
  disabled,
  onSelect,
  loginHref,
}: {
  signedIn: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
  loginHref: string;
}) {
  const btnClass =
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60";
  return (
    <div
      className="mt-5 flex flex-col items-center justify-between gap-3 rounded-2xl border px-6 py-5 text-center sm:flex-row sm:text-left"
      style={{ border: `1px dashed ${FNO_BORDER}`, backgroundColor: "rgba(13,24,48,0.5)" }}
    >
      <div>
        <p className="text-sm font-bold text-white">Not ready to subscribe?</p>
        <p className="text-[13px] text-slate-400">
          Get a <span className="text-slate-200">Day Pass</span> — {formatInr(99)} for 24 hours of full access.
        </p>
      </div>
      {!signedIn ? (
        <Link href={loginHref} className={btnClass} style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}>
          Get Day Pass
        </Link>
      ) : (
        <button type="button" onClick={onSelect} disabled={disabled} className={btnClass} style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
            </>
          ) : (
            "Get Day Pass"
          )}
        </button>
      )}
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
      className="mx-auto mb-8 max-w-xl rounded-xl border px-4 py-3 text-center text-sm text-slate-200"
      style={{ borderColor: FNO_BORDER, backgroundColor: "#0d1830" }}
    >
      {message}
    </div>
  );
}

/**
 * The real subscription plan cards — Free trial / Silver / Gold as primary
 * cards, with a secondary Day Pass callout. Live Zoho checkout via "Select"
 * (routes logged-out visitors through login, then resumes checkout). Shared by
 * the /subscribe page and the landing pricing section.
 */
export function FnoNinjaPlanCards({
  showStatusBanner = false,
  className,
}: {
  showStatusBanner?: boolean;
  className?: string;
}) {
  return (
    <Suspense fallback={null}>
      <div className={className}>
        <PlanCardsInner showStatusBanner={showStatusBanner} />
      </div>
    </Suspense>
  );
}

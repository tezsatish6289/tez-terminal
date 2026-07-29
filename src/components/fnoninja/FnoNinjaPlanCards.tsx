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
  "Watchlist & Livelist",
  "Community chat",
];

const PREMIUM_FEATURES = ["Atlas AI setup coach", "Watchlist & Livelist Autoplay"];

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
    note: "Watchlist & Livelist are manual. Autoplay and Atlas AI are Gold features.",
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

function PlanCardsInner({
  showStatusBanner,
  ctaSource,
}: {
  showStatusBanner: boolean;
  ctaSource: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isUserLoading } = useUser();
  const sub = useSubscription(
    user?.uid,
    user ? { name: user.displayName, email: user.email, photo: user.photoURL } : undefined,
  );

  const [loadingTier, setLoadingTier] = useState<CheckoutTier | null>(null);
  const [phonePromptTier, setPhonePromptTier] = useState<CheckoutTier | null>(null);
  const [flashDiscounts, setFlashDiscounts] = useState<{
    gold: number;
    silver: number;
  } | null>(null);
  const autoFired = useRef(false);

  const signedIn = !!user && !isUserLoading;
  const trialEnded = signedIn && sub.isExpired;
  const wantFlashSale = searchParams.get("flash") === "1";
  const applyFlashSale =
    wantFlashSale &&
    flashDiscounts != null &&
    flashDiscounts.gold > 0 &&
    !(signedIn && sub.status === "active");

  useEffect(() => {
    if (!wantFlashSale) {
      setFlashDiscounts(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fnoninja/flash-sale", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          active?: boolean;
          discountInr?: number;
          discountGoldInr?: number;
          discountSilverInr?: number;
        };
        if (cancelled) return;
        if (data.active) {
          const gold = data.discountGoldInr ?? data.discountInr;
          const silver = data.discountSilverInr;
          if (typeof gold === "number" && typeof silver === "number") {
            setFlashDiscounts({ gold, silver });
            return;
          }
        }
        setFlashDiscounts(null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wantFlashSale]);

  function flashOffFor(tier: "silver" | "gold"): number {
    if (!flashDiscounts) return 0;
    return tier === "silver" ? flashDiscounts.silver : flashDiscounts.gold;
  }

  async function handleSubscribe(tier: CheckoutTier, phone?: string) {
    if (!user) return;
    setLoadingTier(tier);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscription/zoho/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          tier,
          phone,
          flashSale: applyFlashSale && (tier === "silver" || tier === "gold"),
        }),
      });
      const data = await res.json();
      // Razorpay needs a contact number and we don't have one on file yet —
      // collect it, then this same call is retried with the number.
      if (res.status === 422 && data?.code === "phone_required") {
        setLoadingTier(null);
        setPhonePromptTier(tier);
        return;
      }
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

  // Day Pass self-heal/activation now runs app-wide via FnoNinjaDayPassReconciler
  // (payment links can't redirect back), so it's handled regardless of which
  // page the buyer returns to — no per-page verification needed here.

  // Login destination that resumes the chosen action after OAuth. The ?src/?cta
  // stamp the sign_up-collection attribution (e.g. landing · select_silver).
  const loginForCheckout = (tier: CheckoutTier) =>
    fnoLoginHref(
      pathname,
      `${fnoSubscribeHref(pathname)}?checkout=${tier}${wantFlashSale ? "&flash=1" : ""}`,
      {
        src: ctaSource,
        cta: `select_${tier === "daypass" ? "daypass" : tier}`,
      },
    );
  const loginForTrial = () =>
    fnoLoginHref(pathname, fnoAnalyticsHref(pathname), {
      src: ctaSource,
      cta: "select_free_trial",
    });

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
      // Trial was used and has ended — can't be restarted. Grey it out so the
      // user knows to subscribe or grab a Day Pass instead.
      if (sub.isExpired) {
        return (
          <span
            className={`${outlineBtn} opacity-60`}
            style={{ borderColor: FNO_BORDER, color: "#64748b" }}
          >
            Trial ended
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

      {applyFlashSale ? (
        <div
          className="mb-5 rounded-2xl px-4 py-3 text-center sm:text-left"
          style={{
            border: "1px solid rgba(245,158,11,0.35)",
            background:
              "linear-gradient(135deg, rgba(120,53,15,0.35) 0%, rgba(13,24,48,0.9) 60%)",
          }}
        >
          <p className="text-sm font-bold text-amber-100">
            Flash sale — {formatInr(flashDiscounts!.silver)} off Silver ·{" "}
            {formatInr(flashDiscounts!.gold)} off Gold
          </p>
          <p className="mt-1 text-[12px] text-amber-100/70">
            Applied at checkout on your first invoice. Day Pass excluded. Limited spots today.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {PRIMARY_CARDS.map((card) => (
          <article
            key={card.label}
            className={`relative flex h-full flex-col rounded-2xl p-6 sm:p-7 ${
              card.highlight
                ? "border border-[#3b82f6]/40 bg-gradient-to-b from-[#3b82f6]/[0.14] via-[#0b1428] to-[#0a1120] shadow-[0_20px_60px_-20px_rgba(59,130,246,0.4)]"
                : ""
            } ${card.kind === "trial" && trialEnded ? "opacity-60" : ""}`}
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
                <p className="text-3xl font-black leading-none text-white sm:text-4xl">Free trial</p>
              ) : applyFlashSale ? (
                <>
                  <p className="text-3xl font-black leading-none text-white sm:text-4xl">
                    {formatInr(Math.max(0, card.priceInr - flashOffFor(card.tier)))}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 line-through">{formatInr(card.priceInr)}</p>
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    {formatInr(flashOffFor(card.tier))} flash sale off
                  </p>
                </>
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
        hasAccess={signedIn && sub.isActive}
        loading={loadingTier === "daypass"}
        disabled={loadingTier !== null}
        onSelect={() => handleSubscribe("daypass")}
        loginHref={loginForCheckout("daypass")}
      />

      {phonePromptTier ? (
        <MobilePrompt
          onClose={() => setPhonePromptTier(null)}
          onSubmit={(phone) => {
            const tier = phonePromptTier;
            setPhonePromptTier(null);
            void handleSubscribe(tier, phone);
          }}
        />
      ) : null}
    </>
  );
}

function MobilePrompt({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (phone: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const digits = value.replace(/\D/g, "");
    const ten = digits.length > 10 ? digits.slice(-10) : digits;
    if (!/^[6-9]\d{9}$/.test(ten)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    onSubmit(ten);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6"
        style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "#0d1830" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold text-white">Add your mobile number</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
          Our payment partner needs a contact number to process the payment. We store it encrypted
          for checkout only — no spam, never sold.
        </p>

        <div
          className="mt-5 flex items-center rounded-xl border px-3"
          style={{ borderColor: error ? "#ef4444" : FNO_BORDER, backgroundColor: "#0a1120" }}
        >
          <span className="pr-2 text-sm font-semibold text-slate-400">+91</span>
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            maxLength={14}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="10-digit mobile number"
            className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-600"
          />
        </div>
        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border py-2.5 text-sm font-semibold text-slate-300"
            style={{ borderColor: FNO_BORDER }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function DayPassCallout({
  signedIn,
  hasAccess,
  loading,
  disabled,
  onSelect,
  loginHref,
}: {
  signedIn: boolean;
  hasAccess: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
  loginHref: string;
}) {
  // A user who already has access (trial or active plan) doesn't need a Day Pass.
  if (hasAccess) {
    return (
      <div
        className="mt-5 rounded-2xl border px-6 py-4 text-center text-[13px] text-slate-400"
        style={{ border: `1px dashed ${FNO_BORDER}`, backgroundColor: "rgba(13,24,48,0.5)" }}
      >
        You already have full access — no Day Pass needed right now.
      </div>
    );
  }

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
  ctaSource = "landing",
}: {
  showStatusBanner?: boolean;
  className?: string;
  /** sign_up-collection origin bucket for the plan CTAs (landing | subscribe). */
  ctaSource?: string;
}) {
  return (
    <Suspense fallback={null}>
      <div className={className}>
        <PlanCardsInner showStatusBanner={showStatusBanner} ctaSource={ctaSource} />
      </div>
    </Suspense>
  );
}

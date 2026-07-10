"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CreditCard, Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { useSubscription } from "@/hooks/use-subscription";
import { fnoLoginHref, fnoMySubscriptionHref, fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { formatInr } from "@/lib/fnoninja/pricing";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW } from "@/lib/fnoninja/theme";
import type { Tier } from "@/lib/entitlements";

const FNO_BORDER = "rgba(90,140,220,0.2)";

const PLAN_META: Record<Tier, { label: string; amountInr: number | null }> = {
  free: { label: "Free trial", amountInr: null },
  silver: { label: "Silver", amountInr: 4500 },
  gold: { label: "Gold", amountInr: 7200 },
  daypass: { label: "Day Pass", amountInr: 99 },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0" style={{ borderColor: FNO_BORDER }}>
      <span className="text-[13px] text-slate-400">{label}</span>
      <span className="text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

export function FnoNinjaMySubscriptionPage() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const sub = useSubscription(
    user?.uid,
    user ? { name: user.displayName, email: user.email, photo: user.photoURL } : undefined,
  );

  const subscribeHref = fnoSubscribeHref(pathname);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(37,99,235,0.08)" }}
        >
          <CreditCard className="h-4 w-4 text-[#60a5fa]" />
        </span>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">My subscription</h1>
      </div>

      {isUserLoading || (user && sub.isLoading) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#60a5fa]" />
        </div>
      ) : !user ? (
        <SignInPrompt href={fnoLoginHref(pathname, fnoMySubscriptionHref(pathname))} />
      ) : (
        <SubscriptionCard sub={sub} subscribeHref={subscribeHref} />
      )}
    </div>
  );
}

function SignInPrompt({ href }: { href: string }) {
  return (
    <div
      className="rounded-2xl border p-8 text-center"
      style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "#0d1830" }}
    >
      <p className="text-sm text-slate-300">Sign in to view your subscription and plan details.</p>
      <Link
        href={href}
        className="mt-5 inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
        style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
      >
        Sign in
      </Link>
    </div>
  );
}

function SubscriptionCard({
  sub,
  subscribeHref,
}: {
  sub: ReturnType<typeof useSubscription>;
  subscribeHref: string;
}) {
  const tier = sub.tier;
  const meta = tier ? PLAN_META[tier] : null;
  const hasAccess = sub.isActive; // trial or active plan

  // Status pill
  let statusLabel: string;
  let statusTone: { color: string; bg: string; border: string };
  if (sub.isTrial) {
    statusLabel = "Trial";
    statusTone = { color: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(90,140,220,0.35)" };
  } else if (sub.isActive) {
    statusLabel = "Active";
    statusTone = { color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" };
  } else {
    statusLabel = "Expired";
    statusTone = { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)" };
  }

  const planLabel = meta?.label ?? (hasAccess ? "—" : "No active plan");
  const amount = sub.isTrial
    ? "Free"
    : meta?.amountInr != null
      ? formatInr(meta.amountInr)
      : "—";

  const isRenewing = sub.isActive && !sub.isTrial && sub.autoRenew === true;
  const expiryLabel = isRenewing ? "Renews on" : "Expires on";
  const expiryValue = formatDate(sub.subscriptionEndDate ?? sub.trialEndDate);

  const remaining = sub.showHours
    ? `${sub.hoursRemaining} hour${sub.hoursRemaining === 1 ? "" : "s"} left`
    : `${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"} left`;

  const isTopPlan = sub.isActive && tier === "gold";

  return (
    <div
      className="rounded-2xl border p-6 sm:p-7"
      style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "#0d1830" }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current plan</p>
          <p className="mt-1 text-2xl font-black text-white">{planLabel}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest"
          style={{ color: statusTone.color, backgroundColor: statusTone.bg, border: `1px solid ${statusTone.border}` }}
        >
          {statusLabel}
        </span>
      </div>

      {hasAccess ? (
        <div className="mb-2">
          <Row label="Amount" value={amount} />
          <Row label="Started on" value={formatDate(sub.startDate)} />
          <Row label={expiryLabel} value={expiryValue} />
          <Row label="Time remaining" value={remaining} />
          {!sub.isTrial ? (
            <Row label="Auto-renew" value={sub.autoRenew ? "On" : "Off (one-time)"} />
          ) : null}
        </div>
      ) : (
        <p className="mb-2 text-[13px] leading-relaxed text-slate-400">
          You don&apos;t have an active plan right now. Choose a plan to unlock full access.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {!hasAccess ? (
          <Link
            href={subscribeHref}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            Choose a plan
          </Link>
        ) : isTopPlan ? (
          <div
            className="flex-1 rounded-xl border py-3 text-center text-sm font-semibold text-slate-300"
            style={{ borderColor: FNO_BORDER }}
          >
            You&apos;re on our top plan
          </div>
        ) : (
          <Link
            href={subscribeHref}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            Upgrade plan <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
        Payments are securely managed by Zoho Billing (via Razorpay). To cancel or change payment
        details, contact support. Informational data only — not investment advice.
      </p>
    </div>
  );
}

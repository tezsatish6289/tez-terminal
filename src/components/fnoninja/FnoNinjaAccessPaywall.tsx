"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Crown, Lock } from "lucide-react";
import type { LockReason } from "@/lib/entitlements";
import { fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { trackCtaClick } from "@/firebase/analytics";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW, FNO_MUTED } from "@/lib/fnoninja/theme";

/** Everything a paid member gets — shown on the wall so lapsed users see the value. */
const INCLUDED = [
  "Full NSE F&O bubble market map",
  "Symbol deep-dive charts & levels",
  "Atlas AI setup coach",
  "FavSlide & LiveSlide slideshows",
  "Favourites, community chat & news",
];

const COPY: Record<
  LockReason,
  { badge: string; title: string; body: string; icon: typeof Crown }
> = {
  subscription_required: {
    badge: "Your access has ended",
    title: "Subscribe to keep going",
    body: "Your free trial is over. Pick a plan to unlock the full terminal — or grab a Day Pass for a single session.",
    icon: Lock,
  },
  upgrade_required: {
    badge: "A Gold feature",
    title: "Upgrade to unlock this",
    body: "Atlas AI, FavSlide and LiveSlide are included with Gold and the Day Pass. Upgrade to unlock them.",
    icon: Crown,
  },
  // Guests are handled by the sign-in gate elsewhere; included for completeness.
  login_required: {
    badge: "Members only",
    title: "Sign in to continue",
    body: "Sign in to start your free trial and unlock the full terminal.",
    icon: Lock,
  },
};

/**
 * Full-cover paywall that blocks the centre of a protected page (deep dive /
 * FavSlide / LiveSlide) for a logged-in user whose access has lapsed. The page
 * content stays visible-but-blurred behind it — "pay and step in", not "get
 * out". Render inside a `relative` container; it fills the parent.
 */
export function FnoNinjaAccessPaywall({
  reason = "subscription_required",
  onBack,
  backLabel,
}: {
  reason?: LockReason;
  /** Optional escape hatch (e.g. back to the bubble map) so users aren't trapped. */
  onBack?: () => void;
  backLabel?: string;
}) {
  const pathname = usePathname();
  const copy = COPY[reason];
  const Icon = copy.icon;
  const subscribeHref = fnoSubscribeHref(pathname);

  return (
    <div
      className="absolute inset-0 z-[120] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      {/* Blur + dim the content behind so it reads as "just out of reach". */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(3,7,18,0.66)", backdropFilter: "blur(6px)" }}
      />

      <div
        className="relative w-full max-w-md rounded-2xl border p-6 text-center shadow-2xl sm:p-8"
        style={{ backgroundColor: "#0b1524", borderColor: "rgba(148,163,184,0.18)" }}
      >
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            backgroundColor:
              reason === "upgrade_required" ? "rgba(251,191,36,0.14)" : "rgba(37,99,235,0.14)",
          }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: reason === "upgrade_required" ? "#fbbf24" : "#60a5fa" }}
          />
        </div>

        <p
          className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: FNO_MUTED }}
        >
          {copy.badge}
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
          {copy.title}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
          {copy.body}
        </p>

        <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left">
          {INCLUDED.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
              {f}
            </li>
          ))}
        </ul>

        <Link
          href={subscribeHref}
          onClick={() => trackCtaClick("paywall_choose_plan", { reason })}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
          style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
        >
          <Crown className="h-4 w-4" />
          {reason === "upgrade_required" ? "Upgrade to Gold" : "Choose a plan"}
        </Link>

        {reason !== "upgrade_required" ? (
          <Link
            href={subscribeHref}
            onClick={() => trackCtaClick("paywall_day_pass", { reason })}
            className="mt-2.5 block text-xs font-semibold text-slate-300 underline-offset-2 hover:underline"
          >
            or get a Day Pass — ₹99 for 24 hours
          </Link>
        ) : null}

        {onBack ? (
          <button
            type="button"
            onClick={() => {
              trackCtaClick("paywall_back", { reason });
              onBack();
            }}
            className="mt-3 text-[11px] font-semibold underline-offset-2 hover:underline"
            style={{ color: FNO_MUTED }}
          >
            {backLabel ?? "Go back"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

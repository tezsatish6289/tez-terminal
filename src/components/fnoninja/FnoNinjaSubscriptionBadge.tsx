"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Crown, Sparkles } from "lucide-react";
import { useUser } from "@/firebase";
import { useSubscription } from "@/hooks/use-subscription";
import { fnoMySubscriptionHref, fnoSubscribeHref } from "@/lib/fnoninja/paths";

/**
 * Compact subscription status pill for the FNONINJA nav. Always visible for
 * signed-in users: shows remaining trial/plan days (or hours on the final day
 * and for the Day Pass), and links to the subscribe page.
 */
export function FnoNinjaSubscriptionBadge() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const sub = useSubscription(user?.uid);

  if (isUserLoading || !user || sub.isLoading || sub.status === "loading") return null;

  // Expired/no-plan users go to the pricing page to buy; active/trial users go
  // to their subscription details.
  const hasAccess = sub.isActive || sub.isTrial;
  const href = hasAccess ? fnoMySubscriptionHref(pathname) : fnoSubscribeHref(pathname);
  const unit = sub.showHours ? "h" : "d";
  const amount = sub.showHours ? sub.hoursRemaining : sub.daysRemaining;

  let label: string;
  let tone: { color: string; bg: string; border: string };
  let Icon = Sparkles;

  if (sub.isExpired || (!sub.isActive && !sub.isTrial)) {
    label = "Subscribe";
    Icon = Crown;
    tone = { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)" };
  } else if (sub.isTrial) {
    label = `Trial · ${amount}${unit} left`;
    Icon = sub.showHours ? Clock : Sparkles;
    // Warn (amber) when almost out; otherwise brand blue.
    tone =
      amount <= (sub.showHours ? 6 : 2)
        ? { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)" }
        : { color: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(90,140,220,0.35)" };
  } else {
    const tierName = sub.tier ? sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1) : "Active";
    label = `${tierName} · ${amount}${unit} left`;
    Icon = sub.tier === "daypass" ? Clock : Crown;
    tone = { color: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(90,140,220,0.35)" };
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all hover:scale-105 sm:text-xs"
      style={{ color: tone.color, backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}
      title="Manage your membership"
    >
      <Icon className="h-3 w-3" />
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}

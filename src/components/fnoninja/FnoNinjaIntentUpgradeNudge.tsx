"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSubscription } from "@/hooks/use-subscription";
import { useUser } from "@/firebase";
import { fnoSubscribeHref } from "@/lib/fnoninja/paths";
import { FNO_CTA_GRADIENT, FNO_MUTED } from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";
import { postTrialActivity } from "@/lib/fnoninja/trial-activity-client";

/**
 * Soft pay CTA shown at high-intent moments (alerts on, Atlas result) for trial users.
 */
export function FnoNinjaIntentUpgradeNudge({
  reason,
  className = "",
}: {
  reason: "alerts_enabled" | "atlas_result";
  className?: string;
}) {
  const { user } = useUser();
  const sub = useSubscription(user?.uid, {
    name: user?.displayName,
    email: user?.email,
    photo: user?.photoURL,
  });
  const pathname = usePathname();

  if (sub.isLoading || !sub.isTrial || !sub.isActive) return null;

  const copy =
    reason === "alerts_enabled"
      ? "Alerts are on — upgrade to keep them after your trial, or unlock A+ floors on Gold."
      : "Atlas mapped your idea — keep coaching + A+ alerts with Gold, or stay on Silver for the full map.";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${className}`}
      style={{
        borderColor: "rgba(251,191,36,0.28)",
        backgroundColor: "rgba(251,191,36,0.08)",
      }}
    >
      <p className="text-[12px] leading-snug" style={{ color: "#fde68a" }}>
        {copy}
      </p>
      <Link
        href={fnoSubscribeHref(pathname)}
        onClick={() => {
          trackCtaClick("intent_upgrade_nudge", { reason });
          void postTrialActivity(
            user,
            "upgrade_prompt_cta",
            { reason, surface: "intent_nudge" },
            { oncePerSession: false },
          );
        }}
        className="mt-2 inline-flex rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
        style={{ background: FNO_CTA_GRADIENT }}
      >
        See plans
      </Link>
      <p className="mt-1.5 text-[10px]" style={{ color: FNO_MUTED }}>
        {sub.daysRemaining} day{sub.daysRemaining === 1 ? "" : "s"} left on trial
      </p>
    </div>
  );
}

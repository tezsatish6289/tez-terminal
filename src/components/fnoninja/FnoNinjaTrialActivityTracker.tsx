"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/firebase";
import { isFnoNinjaAppContext } from "@/lib/fnoninja/auth";
import { postTrialActivity } from "@/lib/fnoninja/trial-activity-client";

/**
 * Records page-level trial funnel milestones (map / chart / subscribe).
 * Liveslide is tracked from the levels page view switch; server routes own
 * favslide add, alerts, phone, chat, payment, trial_started.
 */
function TrackerInner() {
  const { user, isUserLoading } = useUser();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (typeof window === "undefined") return;
    if (!isFnoNinjaAppContext(pathname, window.location.hostname)) return;

    const path = pathname.replace(/\/$/, "") || "/";

    if (path.includes("/subscribe")) {
      void postTrialActivity(user, "subscribe_viewed", { path });
      return;
    }

    if (path.includes("/levels/chart") || /\/chart$/.test(path)) {
      void postTrialActivity(user, "chart_opened", { path });
      return;
    }

    // Bubble map (not slide modes — those fire from levels page enter*).
    if (path.includes("/levels") || path === "/") {
      void postTrialActivity(user, "map_opened", { path });
    }
  }, [user, isUserLoading, pathname]);

  return null;
}

export function FnoNinjaTrialActivityTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}

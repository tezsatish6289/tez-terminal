"use client";

import { useCallback, useEffect, useRef } from "react";
import { useUser } from "@/firebase";
import { toast } from "@/hooks/use-toast";
import { isFnoNinjaAppContext } from "@/lib/fnoninja/auth";

const THROTTLE_MS = 20_000;

/**
 * Zoho payment links can't redirect back to us after a Day Pass payment, so the
 * buyer lands on Zoho's success page and returns to FNONINJA on their own. This
 * global reconciler makes that return seamless: on load (and when the tab
 * regains focus) it asks the server to confirm any just-completed Day Pass and
 * pops a success toast.
 *
 * It's cheap and safe to call broadly — the endpoint returns immediately for
 * users without a Zoho customer id or who are already active, only reaching out
 * to Zoho for someone who actually has a pending payment. Doubles as a
 * self-healing net if the webhook is ever delayed or misconfigured.
 */
export function FnoNinjaDayPassReconciler() {
  const { user, isUserLoading } = useUser();
  const lastCheck = useRef(0);
  const toastedFor = useRef<string | null>(null);

  const reconcile = useCallback(async () => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (!isFnoNinjaAppContext(window.location.pathname)) return;
    if (Date.now() - lastCheck.current < THROTTLE_MS) return;
    lastCheck.current = Date.now();

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscription/zoho/verify-daypass", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data?.applied && toastedFor.current !== user.uid) {
        toastedFor.current = user.uid;
        toast({
          title: "Day Pass activated",
          description: "You now have 24 hours of full access. Enjoy!",
        });
        // Nudge any subscription-aware UI to re-read the fresh entitlement.
        window.dispatchEvent(new Event("fnoninja:subscription-refresh"));
      }
    } catch {
      lastCheck.current = 0; // allow a retry on the next trigger
    }
  }, [user]);

  useEffect(() => {
    if (isUserLoading || !user) return;
    void reconcile();

    const onFocus = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, isUserLoading, reconcile]);

  return null;
}

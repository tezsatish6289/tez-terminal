"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/firebase";
import { FNO_REFERRAL_STORAGE_KEY } from "@/lib/fnoninja/affiliate-shared";

/**
 * Captures ?ref= on FNO Ninja into localStorage and attributes
 * users/{uid}.fnoninjaReferredBy on login (first-touch) + trial bonus.
 */
export function FnoNinjaAffiliateTracker() {
  const { user, isUserLoading } = useUser();
  const attributedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.length > 0) {
      localStorage.setItem(FNO_REFERRAL_STORAGE_KEY, ref.trim().toLowerCase());
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (isUserLoading || !user || attributedRef.current) return;
    const storedRef = localStorage.getItem(FNO_REFERRAL_STORAGE_KEY);
    if (!storedRef) return;
    attributedRef.current = true;

    void (async () => {
      try {
        // Ensure trial exists before bonus extension.
        const statusParams = new URLSearchParams({
          uid: user.uid,
          product: "fnoninja",
        });
        if (user.displayName) statusParams.set("name", user.displayName);
        if (user.email) statusParams.set("email", user.email);
        await fetch(`/api/subscription/status?${statusParams}`);

        const token = await user.getIdToken();
        const res = await fetch("/api/fnoninja/affiliate/track", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ referralCode: storedRef }),
        });
        const data = (await res.json()) as {
          attributed?: boolean;
          bonusApplied?: boolean;
        };
        if (data.attributed || data.bonusApplied) {
          localStorage.removeItem(FNO_REFERRAL_STORAGE_KEY);
          window.dispatchEvent(new Event("subscription-refresh"));
        }
      } catch {
        attributedRef.current = false;
      }
    })();
  }, [user, isUserLoading]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/firebase";

const REF_STORAGE_KEY = "fno_referral_code";

/**
 * Captures ?ref= on FNO Ninja into localStorage and attributes
 * users/{uid}.fnoninjaReferredBy on login (first-touch).
 */
export function FnoNinjaAffiliateTracker() {
  const { user, isUserLoading } = useUser();
  const attributedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.length > 0) {
      localStorage.setItem(REF_STORAGE_KEY, ref.trim().toLowerCase());
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (isUserLoading || !user || attributedRef.current) return;
    const storedRef = localStorage.getItem(REF_STORAGE_KEY);
    if (!storedRef) return;
    attributedRef.current = true;

    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/fnoninja/affiliate/track", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ referralCode: storedRef }),
        });
        const data = (await res.json()) as { attributed?: boolean };
        if (data.attributed) localStorage.removeItem(REF_STORAGE_KEY);
      } catch {
        attributedRef.current = false;
      }
    })();
  }, [user, isUserLoading]);

  return null;
}

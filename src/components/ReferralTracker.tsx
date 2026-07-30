"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/firebase";

const REF_STORAGE_KEY = "tez_referral_code";

function isFnoNinjaHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  if (h === "fnoninja.com" || h === "www.fnoninja.com") return true;
  // Local / shared host FNO routes — leave ?ref= for FnoNinjaAffiliateTracker.
  const path = window.location.pathname;
  return path === "/fnoninja" || path.startsWith("/fnoninja/");
}

/**
 * Captures ?ref= query param into localStorage on mount,
 * and attributes the referral when a new user signs in.
 * Skipped on FNO Ninja (handled by FnoNinjaAffiliateTracker).
 */
export function ReferralTracker() {
  const { user, isUserLoading } = useUser();
  const attributedRef = useRef(false);

  // Step 1: Capture ?ref= param from URL into localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isFnoNinjaHost()) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.length > 0) {
      localStorage.setItem(REF_STORAGE_KEY, ref);
      // Clean the URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Step 2: When a user logs in, check if there's a stored referral code and attribute it
  useEffect(() => {
    if (isUserLoading || !user || attributedRef.current) return;
    if (isFnoNinjaHost()) return;

    const storedRef = localStorage.getItem(REF_STORAGE_KEY);
    if (!storedRef) return;

    attributedRef.current = true;

    fetch("/api/referral/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralCode: storedRef,
        userId: user.uid,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.attributed) {
          localStorage.removeItem(REF_STORAGE_KEY);
        }
      })
      .catch(() => {});
  }, [user, isUserLoading]);

  return null;
}

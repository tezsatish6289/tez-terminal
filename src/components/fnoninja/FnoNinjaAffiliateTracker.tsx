"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/firebase";
import { FNO_REFERRAL_STORAGE_KEY } from "@/lib/fnoninja/affiliate-shared";

/** TezTerminal root tracker may have stolen ?ref= before FNO mounts. */
const TEZ_REFERRAL_STORAGE_KEY = "tez_referral_code";

export const FNO_REFERRAL_TRACK_EVENT = "fno-referral-track-done";

function capturePendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("ref")?.trim().toLowerCase();
  if (fromUrl) {
    localStorage.setItem(FNO_REFERRAL_STORAGE_KEY, fromUrl);
    // Also clear Tez key so crypto tracker doesn't claim this FNO visit.
    localStorage.removeItem(TEZ_REFERRAL_STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    window.history.replaceState({}, "", url.toString());
    return fromUrl;
  }

  const fromFno = localStorage.getItem(FNO_REFERRAL_STORAGE_KEY)?.trim().toLowerCase();
  if (fromFno) return fromFno;

  // Recover if Tez ReferralTracker captured ?ref= first (root layout runs earlier).
  const fromTez = localStorage.getItem(TEZ_REFERRAL_STORAGE_KEY)?.trim().toLowerCase();
  if (fromTez) {
    localStorage.setItem(FNO_REFERRAL_STORAGE_KEY, fromTez);
    localStorage.removeItem(TEZ_REFERRAL_STORAGE_KEY);
    return fromTez;
  }

  return null;
}

function emitTrackDone(detail: {
  attributed: boolean;
  bonusApplied: boolean;
  code: string | null;
}) {
  window.dispatchEvent(new CustomEvent(FNO_REFERRAL_TRACK_EVENT, { detail }));
}

/**
 * Captures ?ref= on FNO Ninja and attributes fnoninjaReferredBy on login
 * (first-touch) + trial bonus.
 */
export function FnoNinjaAffiliateTracker() {
  const { user, isUserLoading } = useUser();
  const attributedRef = useRef(false);

  useEffect(() => {
    capturePendingReferralCode();
  }, []);

  useEffect(() => {
    if (isUserLoading || !user || attributedRef.current) return;
    const storedRef = capturePendingReferralCode();
    if (!storedRef) {
      emitTrackDone({ attributed: false, bonusApplied: false, code: null });
      return;
    }
    attributedRef.current = true;

    void (async () => {
      try {
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
          reason?: string;
        };
        const attributed = Boolean(data.attributed);
        const bonusApplied = Boolean(data.bonusApplied);
        // Clear storage on success or permanent failures (invalid / self / already).
        if (
          attributed ||
          bonusApplied ||
          data.reason === "already_attributed" ||
          data.reason === "invalid_code" ||
          data.reason === "self_referral"
        ) {
          localStorage.removeItem(FNO_REFERRAL_STORAGE_KEY);
          localStorage.removeItem(TEZ_REFERRAL_STORAGE_KEY);
        }
        if (attributed || bonusApplied) {
          window.dispatchEvent(new Event("subscription-refresh"));
        }
        emitTrackDone({ attributed, bonusApplied, code: storedRef });
      } catch {
        attributedRef.current = false;
        emitTrackDone({ attributed: false, bonusApplied: false, code: storedRef });
      }
    })();
  }, [user, isUserLoading]);

  return null;
}

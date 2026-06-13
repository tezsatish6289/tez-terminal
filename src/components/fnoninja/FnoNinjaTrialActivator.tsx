"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/firebase";
import { toast } from "@/hooks/use-toast";
import { isFnoNinjaAppContext } from "@/lib/fnoninja/auth";
import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

const SESSION_KEY = "fnoninja-trial-toast-shown";

/** Activates FNONINJA trial on first sign-in and shows a success toast once per session. */
export function FnoNinjaTrialActivator() {
  const { user, isUserLoading } = useUser();
  const activatedUid = useRef<string | null>(null);

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (typeof window === "undefined") return;
    if (!isFnoNinjaAppContext(window.location.pathname)) return;
    if (activatedUid.current === user.uid) return;
    if (sessionStorage.getItem(SESSION_KEY) === user.uid) return;

    activatedUid.current = user.uid;

    const params = new URLSearchParams({ uid: user.uid, product: "fnoninja" });
    if (user.displayName) params.set("name", user.displayName);
    if (user.email) params.set("email", user.email);
    if (user.photoURL) params.set("photo", user.photoURL);

    void fetch(`/api/subscription/status?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.trialJustActivated) {
          sessionStorage.setItem(SESSION_KEY, user.uid);
          toast({
            title: "30-day free trial activated",
            description: `Your ${FNONINJA_FREE_TRIAL_DAYS}-day free trial is now active. Enjoy full access to charts and analytics.`,
          });
        }
      })
      .catch(() => {
        activatedUid.current = null;
      });
  }, [user, isUserLoading]);

  return null;
}

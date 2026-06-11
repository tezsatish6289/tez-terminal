"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/firebase";
import { isFnoNinjaAppContext } from "@/lib/fnoninja/auth";

/** Records FNONINJA product usage in Firestore when a user signs in on fnoninja.com. */
export function FnoNinjaAuthTracker() {
  const { user, isUserLoading } = useUser();
  const trackedUid = useRef<string | null>(null);

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (typeof window === "undefined") return;
    if (!isFnoNinjaAppContext(window.location.pathname)) return;
    if (trackedUid.current === user.uid) return;

    trackedUid.current = user.uid;

    void user
      .getIdToken()
      .then((token) =>
        fetch("/api/fnoninja/auth/track", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .catch(() => {
        trackedUid.current = null;
      });
  }, [user, isUserLoading]);

  return null;
}

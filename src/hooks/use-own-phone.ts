"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/firebase";
import { normalizeIndianMobile } from "@/lib/phone-format";

/**
 * Read-only mobile for the signed-in user's profile UI.
 * Prefers Firebase-linked phone, else encrypted number from /api/fnoninja/phone/status.
 */
export function useOwnPhoneDisplay(): string | null {
  const { user, isUserLoading } = useUser();
  const [display, setDisplay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener("fnoninja:subscription-refresh", onRefresh);
    return () => window.removeEventListener("fnoninja:subscription-refresh", onRefresh);
  }, [refresh]);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setDisplay(null);
      return;
    }

    const fromAuth = normalizeIndianMobile(user.phoneNumber);
    if (fromAuth) {
      setDisplay(`+91 ${fromAuth}`);
      return;
    }

    let cancelled = false;
    void user
      .getIdToken()
      .then((token) =>
        fetch("/api/fnoninja/phone/status", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { phone?: string | null };
      })
      .then((data) => {
        if (cancelled) return;
        const ten = normalizeIndianMobile(data?.phone ?? null);
        setDisplay(ten ? `+91 ${ten}` : null);
      })
      .catch(() => {
        if (!cancelled) setDisplay(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user, isUserLoading, user?.phoneNumber, tick]);

  return display;
}

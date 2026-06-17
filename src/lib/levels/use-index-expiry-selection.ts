"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  applyExpiryToPublicLevels,
  defaultIndexExpiryKey,
} from "@/lib/levels/index-expiry-levels";

/** Index chart: pick nearest expiry by default; reset when symbol changes. */
export function useIndexExpirySelection(
  levels: PublicLevels | null | undefined,
  scope: "index" | "stock" | null,
  urlExpiryKey?: string | null,
): {
  selectedExpiryKey: string | null;
  setSelectedExpiryKey: (key: string) => void;
  displayLevels: PublicLevels | null;
  expiryOptions: PublicLevels["expiryOptions"];
} {
  const expiryOptions = scope === "index" ? levels?.expiryOptions : undefined;
  const defaultKey = useMemo(() => defaultIndexExpiryKey(levels ?? null), [levels]);
  const [selectedExpiryKey, setSelectedExpiryKey] = useState<string | null>(null);

  useEffect(() => {
    if (scope !== "index") {
      setSelectedExpiryKey(null);
      return;
    }
    if (urlExpiryKey && expiryOptions?.some((o) => o.key === urlExpiryKey)) {
      setSelectedExpiryKey(urlExpiryKey);
      return;
    }
    setSelectedExpiryKey(defaultKey);
  }, [scope, defaultKey, urlExpiryKey, expiryOptions]);

  const displayLevels = useMemo(() => {
    if (!levels || scope !== "index") return levels ?? null;
    return applyExpiryToPublicLevels(levels, selectedExpiryKey ?? defaultKey);
  }, [levels, scope, selectedExpiryKey, defaultKey]);

  return {
    selectedExpiryKey: selectedExpiryKey ?? defaultKey,
    setSelectedExpiryKey,
    displayLevels,
    expiryOptions,
  };
}

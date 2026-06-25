"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  applyExpiryToPublicLevels,
  defaultIndexExpiryKey,
} from "@/lib/levels/index-expiry-levels";

const EXPIRY_SCOPES = new Set<"index" | "stock">(["index", "stock"]);

/** Index/stock chart: pick nearest expiry by default; reset when symbol changes. */
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
  const expiryEnabled = scope != null && EXPIRY_SCOPES.has(scope);
  const expiryOptions = expiryEnabled ? levels?.expiryOptions : undefined;
  const defaultKey = useMemo(() => defaultIndexExpiryKey(levels ?? null), [levels]);
  const [selectedExpiryKey, setSelectedExpiryKey] = useState<string | null>(null);

  useEffect(() => {
    if (!expiryEnabled) {
      setSelectedExpiryKey(null);
      return;
    }
    if (urlExpiryKey && expiryOptions?.some((o) => o.key === urlExpiryKey)) {
      setSelectedExpiryKey(urlExpiryKey);
      return;
    }
    setSelectedExpiryKey(defaultKey);
  }, [expiryEnabled, defaultKey, urlExpiryKey, expiryOptions]);

  const displayLevels = useMemo(() => {
    if (!levels || !expiryEnabled) return levels ?? null;
    return applyExpiryToPublicLevels(levels, selectedExpiryKey ?? defaultKey);
  }, [levels, expiryEnabled, selectedExpiryKey, defaultKey]);

  return {
    selectedExpiryKey: selectedExpiryKey ?? defaultKey,
    setSelectedExpiryKey,
    displayLevels,
    expiryOptions,
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { atlasSideFromLevels } from "@/lib/levels/atlas-score-calibration";

/**
 * Fetches the deterministic Atlas setup score for the chart corner badge.
 * Uses geographic zone side (not OI-gated display tone).
 */
export function useAtlasSetupScore(
  scope: "stock" | "index" | null | undefined,
  symbol: string | null | undefined,
  levels: PublicLevels | null | undefined,
  spotOverride?: number | null,
): number | null {
  const [score, setScore] = useState<number | null>(null);
  const side = useMemo(
    () => atlasSideFromLevels(levels, spotOverride),
    [levels, spotOverride],
  );
  const sym = (symbol ?? "").trim().toUpperCase();

  useEffect(() => {
    if (!scope || !sym || !side) {
      setScore(null);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      try {
        const qs = new URLSearchParams({ scope, symbol: sym, side });
        const res = await fetch(`/api/freedombot/levels/score?${qs}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          score?: { composite?: number };
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || json.score?.composite == null) {
          setScore(null);
          return;
        }
        setScore(json.score.composite);
      } catch {
        if (!cancelled) setScore(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [scope, sym, side]);

  return side ? score : null;
}

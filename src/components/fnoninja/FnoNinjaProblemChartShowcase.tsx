"use client";

import { useEffect, useState } from "react";
import { FnoNinjaLevelsPreviewCard } from "@/components/fnoninja/FnoNinjaLevelsPreviewCard";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { loadProblemShowcase } from "@/lib/levels/resolve-problem-showcase";
import { NIFTY_SHOWCASE_FALLBACK, type ShowcaseSymbol } from "@/lib/levels/pick-widest-cluster-symbol";

/** Live rotating chart / outlook / history for the homepage problem section. */
export function FnoNinjaProblemChartShowcase() {
  const [target, setTarget] = useState<ShowcaseSymbol | null>(null);
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadProblemShowcase();
        if (cancelled) return;
        setTarget(result.target);
        setLevels(result.levels);
      } catch {
        if (!cancelled) {
          setTarget(NIFTY_SHOWCASE_FALLBACK);
          setLevels(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <FnoNinjaLevelsPreviewCard target={target} levels={levels} loading={loading} />;
}

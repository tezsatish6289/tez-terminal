"use client";

import { useEffect, useState } from "react";
import type { AtlasChartSetup } from "@/components/levels/AtlasSetupScoreBadge";
import type { AtlasProbEmphasis, AtlasSideThesis } from "@/lib/levels/atlas-score-calibration";

type ScoreApiResponse = {
  ok?: boolean;
  atlas?: { composite?: number; side?: string };
  up?: AtlasSideThesis;
  down?: AtlasSideThesis;
  emphasis?: AtlasProbEmphasis;
  lowerConfidence?: boolean;
  pvtPresent?: boolean;
  /** Legacy single score (fallback if dual fields missing). */
  score?: { composite?: number };
  calibration?: { winRatePct?: number; bucket?: string };
};

function thesisFallback(score: number, winRatePct: number, bucket: string): AtlasSideThesis {
  return {
    score: Math.round(score),
    probabilityPct: winRatePct,
    bucket,
    bucketWinRatePct: winRatePct,
  };
}

/**
 * Fetches Atlas score + ↑/↓ calibrated probabilities for the chart corner.
 * Works for any symbol with levels (in-zone, near, or between zones).
 */
export function useAtlasSetupScore(
  scope: "stock" | "index" | null | undefined,
  symbol: string | null | undefined,
  /** When false/null levels, skip fetch (no bands to score). */
  hasLevels: boolean,
): AtlasChartSetup | null {
  const [setup, setSetup] = useState<AtlasChartSetup | null>(null);
  const sym = (symbol ?? "").trim().toUpperCase();

  useEffect(() => {
    if (!scope || !sym || !hasLevels) {
      setSetup(null);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      try {
        const qs = new URLSearchParams({ scope, symbol: sym });
        const res = await fetch(`/api/freedombot/levels/score?${qs}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const json = (await res.json()) as ScoreApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setSetup(null);
          return;
        }

        if (json.up && json.down && json.atlas?.composite != null) {
          setSetup({
            atlasScore: json.atlas.composite,
            up: json.up,
            down: json.down,
            emphasis: json.emphasis ?? "both",
            lowerConfidence: json.lowerConfidence ?? !json.pvtPresent,
          });
          return;
        }

        // Legacy API shape
        const composite = json.score?.composite;
        if (composite == null || !Number.isFinite(composite)) {
          setSetup(null);
          return;
        }
        const wr = json.calibration?.winRatePct ?? 50;
        const bucket = json.calibration?.bucket ?? "50–69";
        const t = thesisFallback(composite, wr, bucket);
        setSetup({
          atlasScore: composite,
          up: t,
          down: t,
          emphasis: "both",
          lowerConfidence: true,
        });
      } catch {
        if (!cancelled) setSetup(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [scope, sym, hasLevels]);

  return setup;
}

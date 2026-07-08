"use client";

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { levelsNeedMultiExpiryRefresh } from "@/lib/levels/multi-expiry-levels";
import { symbolLevelsApiUrl } from "@/lib/levels/symbol-levels-api";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import type { BubbleTone } from "@/lib/zones/bubble-tone";
import type { ConfirmedSignalContext } from "@/lib/levels/confirmed-signal-core";

type SymbolLevelsResponse = {
  label?: string;
  data: PublicLevels | null;
  displayTone?: BubbleTone;
  /** Dip-anchored PVT context for live trend-chart signal evaluation. */
  signalContext?: ConfirmedSignalContext | null;
  error?: string;
};

/**
 * Fetch per-symbol levels with an optional client retry when multi-expiry is
 * still missing. When `onPartial` is supplied, the first-pass result is handed
 * back immediately (before the multi-expiry retry) so callers can paint the
 * ladder without waiting on the second round-trip.
 */
export async function fetchSymbolLevels(
  scope: LevelsTvScope,
  symbol: string,
  opts?: { slideshow?: boolean; onPartial?: (data: PublicLevels | null) => void },
): Promise<SymbolLevelsResponse> {
  const load = async (refresh: boolean) => {
    const res = await fetch(
      symbolLevelsApiUrl(scope, symbol, { slideshow: opts?.slideshow, refresh }),
      { cache: "no-store" },
    );
    const json = (await res.json()) as SymbolLevelsResponse & { error?: string };
    return { res, json };
  };

  const first = await load(false);
  if (first.res.ok && levelsNeedMultiExpiryRefresh(first.json.data)) {
    // Render the banded first-pass immediately; the retry only enriches expiries.
    opts?.onPartial?.(first.json.data);
    const second = await load(true);
    return second.json;
  }
  return first.json;
}

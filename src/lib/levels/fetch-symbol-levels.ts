"use client";

import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { levelsNeedMultiExpiryRefresh } from "@/lib/levels/multi-expiry-levels";
import { symbolLevelsApiUrl } from "@/lib/levels/symbol-levels-api";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

type SymbolLevelsResponse = {
  label?: string;
  data: PublicLevels | null;
  error?: string;
};

/** Fetch per-symbol levels with optional client retry when multi-expiry is still missing. */
export async function fetchSymbolLevels(
  scope: LevelsTvScope,
  symbol: string,
  opts?: { slideshow?: boolean },
): Promise<SymbolLevelsResponse> {
  const load = async (refresh: boolean) => {
    const res = await fetch(symbolLevelsApiUrl(scope, symbol, { ...opts, refresh }), {
      cache: "no-store",
    });
    const json = (await res.json()) as SymbolLevelsResponse & { error?: string };
    return { res, json };
  };

  let { res, json } = await load(false);
  if (res.ok && levelsNeedMultiExpiryRefresh(json.data)) {
    ({ res, json } = await load(true));
  }
  return json;
}

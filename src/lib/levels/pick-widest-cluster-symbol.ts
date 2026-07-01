import { buildOutlookSeries } from "@/lib/levels/outlook-series";
import { levelsNeedMultiExpiryRefresh } from "@/lib/levels/multi-expiry-levels";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export type ShowcaseSymbol = {
  scope: LevelsTvScope;
  symbol: string;
  label: string;
  /** Normalized support–resistance corridor width (0–1+). */
  spreadPct: number;
};

export type StockSpreadSource = {
  symbol: string;
  label: string;
  spot: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
};

export const NIFTY_SHOWCASE_FALLBACK: ShowcaseSymbol = {
  scope: "index",
  symbol: "NIFTY",
  label: "Nifty 50",
  spreadPct: 0,
};

/** Corridor between support top and resistance bottom, as % of spot. */
export function zoneCorridorSpreadPct(
  spot: number | null,
  bullZoneHigh: number | null,
  bearZoneLow: number | null,
): number | null {
  if (spot == null || spot <= 0) return null;
  if (bullZoneHigh == null || bearZoneLow == null) return null;
  const gap = bearZoneLow - bullZoneHigh;
  if (!Number.isFinite(gap) || gap <= 0) return null;
  return gap / spot;
}

export function pickWidestSpreadStock(
  stocks: readonly StockSpreadSource[],
): ShowcaseSymbol | null {
  let best: ShowcaseSymbol | null = null;
  for (const s of stocks) {
    const spreadPct = zoneCorridorSpreadPct(s.spot, s.bullZoneHigh, s.bearZoneLow);
    if (spreadPct == null) continue;
    if (!best || spreadPct > best.spreadPct) {
      best = {
        scope: "stock",
        symbol: s.symbol,
        label: s.label,
        spreadPct,
      };
    }
  }
  return best;
}

/** Stock showcase needs full ladder + multi-expiry Outlook. */
export function levelsSupportShowcase(levels: PublicLevels | null | undefined): boolean {
  if (!levels || levels.unavailable) return false;
  if (levels.bullLow == null && levels.bearLow == null) return false;
  if (levelsNeedMultiExpiryRefresh(levels)) return false;
  return buildOutlookSeries(levels) != null;
}

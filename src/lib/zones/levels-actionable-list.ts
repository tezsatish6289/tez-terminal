import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { PublicLevelsSource } from "@/lib/levels/levels-source";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";
import {
  deriveZoneStatus,
  isInZoneStatus,
  matchesSlideshowSetup,
  type PocDirectionFilter,
  type SlideshowFilterCounts,
  type ZoneBands,
  type ZoneStatus,
} from "@/lib/zones/zone-status";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";

/** Optional volatility-regime fields a stock row may carry (display only). */
export interface StockRowVolRegime {
  atmIV?: number | null;
  volRegime?: VolRegimeFlag | null;
  volRegimeReason?: string | null;
  daysToEarnings?: number | null;
  /** Day-over-day OI-wall momentum signal (At/Near filter input). */
  oi?: OiWallMomentum | null;
}

export interface LevelsActionableItem {
  scope: "index" | "stock";
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  currency: "₹";
  data: PublicLevels | null;
}

export function bandsFromLevels(
  data: PublicLevels | null | undefined,
  spotOverride?: number | null,
): ZoneBands {
  return {
    spot: spotOverride ?? data?.spot ?? null,
    bullLow: data?.bullLow ?? null,
    bullHigh: data?.bullHigh ?? null,
    bearLow: data?.bearLow ?? null,
    bearHigh: data?.bearHigh ?? null,
  };
}

export function levelsFromStockRow(row: {
  spot: number | null;
  maxPain?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
  halfWidth?: number | null;
  computedAt?: string | null;
  levelsSource?: PublicLevelsSource | null;
} & StockRowVolRegime): PublicLevels | null {
  const bullLow = row.bullZoneLow ?? null;
  const bearLow = row.bearZoneLow ?? null;
  if (bullLow == null && bearLow == null) return null;

  let bandOffset = row.halfWidth ?? null;
  if (bandOffset == null && row.bullZoneLow != null && row.bullZoneHigh != null) {
    const w = (row.bullZoneHigh - row.bullZoneLow) / 2;
    if (Number.isFinite(w) && w > 0) bandOffset = w;
  }
  if (bandOffset == null && row.bearZoneLow != null && row.bearZoneHigh != null) {
    const w = (row.bearZoneHigh - row.bearZoneLow) / 2;
    if (Number.isFinite(w) && w > 0) bandOffset = w;
  }

  return {
    spot: row.spot,
    poc: row.maxPain ?? null,
    bullLow,
    bullHigh: row.bullZoneHigh ?? null,
    bearLow,
    bearHigh: row.bearZoneHigh ?? null,
    bandOffset,
    bullActive: null,
    bearActive: null,
    computedAt: row.computedAt ?? null,
    unavailable: false,
    levelsSource: row.levelsSource ?? null,
    volRegime: row.volRegime ?? null,
    volRegimeReason: row.volRegimeReason ?? null,
    atmIV: row.atmIV ?? null,
    daysToEarnings: row.daysToEarnings ?? null,
    oi: row.oi ?? null,
  };
}

function stockDisplayLabel(symbol: string, label?: string | null): string {
  return fnoCompanyName(symbol) ?? label ?? symbol;
}

/** Build the geographic In-Zone list (spot inside or near a band). */
export function buildGeographicInZoneList(input: {
  indices: { symbol?: string; label: string; data: PublicLevels | null }[];
  stocks: ({
    symbol: string;
    label: string;
    spot: number | null;
    maxPain?: number | null;
    bullZoneLow?: number | null;
    bullZoneHigh?: number | null;
    bearZoneLow?: number | null;
    bearZoneHigh?: number | null;
    halfWidth?: number | null;
    computedAt?: string | null;
    levelsSource?: PublicLevelsSource | null;
  } & StockRowVolRegime)[];
}): LevelsActionableItem[] {
  const out: LevelsActionableItem[] = [];

  for (const it of input.indices) {
    const symbol = (it.symbol ?? it.label).toUpperCase();
    const data = it.data;
    const bands = bandsFromLevels(data);
    if (!isInZoneStatus(deriveZoneStatus(bands))) continue;
    out.push({
      scope: "index",
      symbol,
      label: it.label,
      status: deriveZoneStatus(bands),
      spot: bands.spot,
      currency: "₹",
      data,
    });
  }

  for (const row of input.stocks) {
    const data = levelsFromStockRow(row);
    if (!data) continue;
    const bands = bandsFromLevels(data, row.spot);
    if (!isInZoneStatus(deriveZoneStatus(bands))) continue;
    out.push({
      scope: "stock",
      symbol: row.symbol,
      label: stockDisplayLabel(row.symbol, row.label),
      status: deriveZoneStatus(bands),
      spot: bands.spot,
      currency: "₹",
      data,
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  return out;
}

/** Build the actionable In-Zone list (directional + min POC RR). */
export function buildLevelsActionableList(input: {
  indices: { symbol?: string; label: string; data: PublicLevels | null }[];
  stocks: ({
    symbol: string;
    label: string;
    spot: number | null;
    maxPain?: number | null;
    bullZoneLow?: number | null;
    bullZoneHigh?: number | null;
    bearZoneLow?: number | null;
    bearZoneHigh?: number | null;
    halfWidth?: number | null;
    computedAt?: string | null;
    levelsSource?: PublicLevelsSource | null;
  } & StockRowVolRegime)[];
  filter?: PocDirectionFilter;
}): LevelsActionableItem[] {
  const filter = input.filter ?? "all";
  const out: LevelsActionableItem[] = [];

  for (const it of input.indices) {
    const symbol = (it.symbol ?? it.label).toUpperCase();
    const data = it.data;
    const bands = bandsFromLevels(data);
    if (!matchesSlideshowSetup(bands, data?.poc ?? null, filter, data?.bandOffset ?? null, data?.oi ?? null)) {
      continue;
    }
    out.push({
      scope: "index",
      symbol,
      label: it.label,
      status: deriveZoneStatus(bands),
      spot: bands.spot,
      currency: "₹",
      data,
    });
  }

  for (const row of input.stocks) {
    const data = levelsFromStockRow(row);
    if (!data) continue;
    const bands = bandsFromLevels(data, row.spot);
    if (!matchesSlideshowSetup(bands, data.poc, filter, data.bandOffset, data.oi)) continue;
    out.push({
      scope: "stock",
      symbol: row.symbol,
      label: stockDisplayLabel(row.symbol, row.label),
      status: deriveZoneStatus(bands),
      spot: bands.spot,
      currency: "₹",
      data,
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  return out;
}

export function buildSlideshowFilterCounts(input: {
  indices: { symbol?: string; label: string; data: PublicLevels | null }[];
  stocks: ({
    symbol: string;
    label: string;
    spot: number | null;
    maxPain?: number | null;
    bullZoneLow?: number | null;
    bullZoneHigh?: number | null;
    bearZoneLow?: number | null;
    bearZoneHigh?: number | null;
    halfWidth?: number | null;
    computedAt?: string | null;
    levelsSource?: PublicLevelsSource | null;
  } & StockRowVolRegime)[];
}): SlideshowFilterCounts {
  const filters: PocDirectionFilter[] = [
    "all",
    "bull",
    "bear",
    "near_bull",
    "near_bear",
  ];
  return Object.fromEntries(
    filters.map((filter) => [
      filter,
      buildLevelsActionableList({ ...input, filter }).length,
    ]),
  ) as SlideshowFilterCounts;
}

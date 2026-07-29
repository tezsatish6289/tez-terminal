import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { stockDocId } from "@/lib/equity-zones-store";
import { resolveZonesExpiryFromStored } from "@/lib/levels/zones-expiry-label";
import { storedSourceToPublic } from "@/lib/levels/levels-source";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  return null;
}

function volRegimeFlag(raw: unknown): VolRegimeFlag | null {
  if (typeof raw !== "string") return null;
  const u = raw.toUpperCase();
  if (u === "CALM" || u === "ELEVATED" || u === "EARNINGS" || u === "UNKNOWN") {
    return u;
  }
  return null;
}

function oiSignal(raw: unknown): OiWallMomentum | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.asOf !== "string" || typeof o.dominancePct !== "number") return null;
  return o as unknown as OiWallMomentum;
}

/** Map a suggested zones Firestore doc → PublicLevels for light Atlas scoring. */
export function publicLevelsFromZoneDoc(
  raw: Record<string, unknown> | null | undefined,
): PublicLevels | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    spot: num(raw.deribitIndexPrice) ?? num(raw.btcPrice),
    poc: num(raw.maxPain),
    bullLow: num(raw.bullZoneLow),
    bullHigh: num(raw.bullZoneHigh),
    bearLow: num(raw.bearZoneLow),
    bearHigh: num(raw.bearZoneHigh),
    bandOffset: num(raw.halfWidthUsd) ?? num(raw.halfWidth) ?? num(raw.bandOffset),
    bullActive: bool(raw.bullActionable),
    bearActive: bool(raw.bearActionable),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : null,
    unavailable: typeof raw.nseFetchError === "string" && raw.nseFetchError !== "",
    levelsSource: storedSourceToPublic(
      typeof raw.source === "string" ? raw.source : null,
    ),
    volRegime: volRegimeFlag(raw.volRegimeFlag),
    volRegimeReason: typeof raw.volRegimeReason === "string" ? raw.volRegimeReason : null,
    atmIV: num(raw.atmIV),
    daysToEarnings: num(raw.daysToEarnings),
    zonesExpiry: resolveZonesExpiryFromStored(raw),
    putClusterSize: num(raw.bullOI),
    callClusterSize: num(raw.bearOI),
    putClusterStrike: num(raw.bullStrike),
    callClusterStrike: num(raw.bearStrike),
    putClusterChange: num(raw.bullOIChange),
    callClusterChange: num(raw.bearOIChange),
    oi: oiSignal(raw.oi),
  };
}

export function zoneDocPath(scope: LevelsTvScope, symbol: string): string {
  const sym = symbol.trim().toUpperCase();
  if (scope === "index") return `config/suggested_index_zones_${sym}`;
  return stockDocId(sym);
}

export function zoneDocLabel(
  raw: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  if (raw && typeof raw.label === "string" && raw.label.trim()) return raw.label.trim();
  return fallback;
}

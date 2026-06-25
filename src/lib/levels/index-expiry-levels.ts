import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { formatZonesExpiryLabel } from "@/lib/levels/zones-expiry-label";
import { isNseExpiryExpired } from "@/lib/levels/zones-expiry-label";

export interface PublicLevelsExpiryOption {
  /** Raw NSE expiry label (e.g. `23-Jun-2026`) — stable selection key. */
  key: string;
  /** Display label (DD/MM/YYYY). */
  label: string;
}

export interface PublicLevelsExpirySlice {
  expiryKey: string;
  zonesExpiry: string | null;
  poc: number | null;
  bullLow: number | null;
  bullHigh: number | null;
  bearLow: number | null;
  bearHigh: number | null;
  bandOffset: number | null;
  putClusterSize: number | null;
  callClusterSize: number | null;
  putClusterStrike: number | null;
  callClusterStrike: number | null;
  /** Change in put OI at support since prev close (+ = reinforcing). */
  putClusterChange: number | null;
  /** Change in call OI at resistance since prev close (+ = reinforcing). */
  callClusterChange: number | null;
}

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sliceFromStoredEntry(entry: Record<string, unknown>): PublicLevelsExpirySlice | null {
  const expiryRaw = entry.expiry;
  if (typeof expiryRaw !== "string" || !expiryRaw.trim()) return null;
  const expiryKey = expiryRaw.trim();
  const zonesExpiry = formatZonesExpiryLabel(expiryKey);
  const hasBands =
    num(entry.bullZoneLow) != null ||
    num(entry.bearZoneLow) != null ||
    num(entry.maxPain) != null;
  if (!hasBands) return null;
  return {
    expiryKey,
    zonesExpiry,
    poc: num(entry.maxPain),
    bullLow: num(entry.bullZoneLow),
    bullHigh: num(entry.bullZoneHigh),
    bearLow: num(entry.bearZoneLow),
    bearHigh: num(entry.bearZoneHigh),
    bandOffset: num(entry.halfWidthUsd),
    putClusterSize: num(entry.bullOI),
    callClusterSize: num(entry.bearOI),
    putClusterStrike: num(entry.bullStrike),
    callClusterStrike: num(entry.bearStrike),
    putClusterChange: num(entry.bullOIChange),
    callClusterChange: num(entry.bearOIChange),
  };
}

function dropExpiredSlices(slices: PublicLevelsExpirySlice[]): PublicLevelsExpirySlice[] {
  return slices.filter((s) => !isNseExpiryExpired(s.expiryKey));
}

/** Build expiry picker options + per-expiry band slices from a stored index doc. */
export function indexExpiryLevelsFromStored(
  raw: Record<string, unknown> | null,
): { expiryOptions: PublicLevelsExpiryOption[]; zonesByExpiry: PublicLevelsExpirySlice[] } {
  if (!raw) return { expiryOptions: [], zonesByExpiry: [] };

  const byExpiry = raw.maxPainByExpiry;
  const slices: PublicLevelsExpirySlice[] = [];

  if (Array.isArray(byExpiry)) {
    const sorted = [...byExpiry]
      .filter((e): e is Record<string, unknown> => e != null && typeof e === "object")
      .sort((a, b) => {
        const ai = typeof a.dayIndex === "number" ? a.dayIndex : 0;
        const bi = typeof b.dayIndex === "number" ? b.dayIndex : 0;
        return ai - bi;
      });
    for (const entry of sorted) {
      const slice = sliceFromStoredEntry(entry);
      if (slice) slices.push(slice);
    }
  }

  if (!slices.length) {
    const fallbackKey =
      typeof raw.expiryUsed === "string"
        ? raw.expiryUsed
        : typeof raw.expiry === "string"
          ? raw.expiry
          : null;
    const zonesExpiry = formatZonesExpiryLabel(fallbackKey);
    if (fallbackKey && zonesExpiry && !isNseExpiryExpired(fallbackKey)) {
      slices.push({
        expiryKey: fallbackKey,
        zonesExpiry,
        poc: num(raw.maxPain),
        bullLow: num(raw.bullZoneLow),
        bullHigh: num(raw.bullZoneHigh),
        bearLow: num(raw.bearZoneLow),
        bearHigh: num(raw.bearZoneHigh),
        bandOffset: num(raw.halfWidthUsd),
        putClusterSize: num(raw.bullOI),
        callClusterSize: num(raw.bearOI),
        putClusterStrike: num(raw.bullStrike),
        callClusterStrike: num(raw.bearStrike),
        putClusterChange: num(raw.bullOIChange),
        callClusterChange: num(raw.bearOIChange),
      });
    }
  }

  const active = dropExpiredSlices(slices);
  const expiryOptions = active.map((s) => ({
    key: s.expiryKey,
    label: s.zonesExpiry ?? s.expiryKey,
  }));

  return { expiryOptions, zonesByExpiry: active };
}

/** Apply a selected expiry slice onto a PublicLevels payload (indices + stocks). */
export function applyExpiryToPublicLevels(
  levels: PublicLevels | null,
  expiryKey: string | null | undefined,
): PublicLevels | null {
  if (!levels?.zonesByExpiry?.length) return levels;
  const key = expiryKey ?? levels.expiryOptions?.[0]?.key ?? null;
  if (!key) return levels;
  const slice = levels.zonesByExpiry.find((s) => s.expiryKey === key);
  if (!slice) return levels;
  return {
    ...levels,
    zonesExpiry: slice.zonesExpiry,
    poc: slice.poc,
    bullLow: slice.bullLow,
    bullHigh: slice.bullHigh,
    bearLow: slice.bearLow,
    bearHigh: slice.bearHigh,
    bandOffset: slice.bandOffset,
    putClusterSize: slice.putClusterSize,
    callClusterSize: slice.callClusterSize,
    putClusterStrike: slice.putClusterStrike,
    callClusterStrike: slice.callClusterStrike,
    putClusterChange: slice.putClusterChange,
    callClusterChange: slice.callClusterChange,
  };
}

/** Default expiry key (nearest / latest in list). */
export function defaultIndexExpiryKey(levels: PublicLevels | null): string | null {
  return levels?.expiryOptions?.[0]?.key ?? null;
}

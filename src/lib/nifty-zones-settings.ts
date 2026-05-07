import type { Firestore } from "firebase-admin/firestore";
import type { AutoZoneClearReason } from "@/lib/heatmap-zones-settings";

export const NIFTY_ZONES_DOC = "config/nifty_zones";

/** AUTO  = NSE OI computed zones, price-based switching.
 *  ZONES = Manually-entered zones, still price-based switching (no NSE merge).
 *  BULL/BEAR/BOTH/OFF = direction overrides that bypass zone logic entirely. */
export type ManualOverride = "AUTO" | "ZONES" | "BULL" | "BOTH" | "BEAR" | "OFF";

export interface NiftyZones {
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneHigh:        number | null;
  bearZoneLow:         number | null;
  bearExitBelow:       number | null;
  manualOverride:      ManualOverride;
  momentumLookbackMin: number | null; // null = disabled
}

export interface PricePoint {
  price: number;
  ts:    number; // unix ms
}

export const ZONE_KEYS: (keyof Omit<NiftyZones, "manualOverride" | "momentumLookbackMin">)[] = [
  "bullZoneLow", "bullZoneHigh", "bullExitAbove",
  "bearZoneHigh", "bearZoneLow", "bearExitBelow",
];

export const VALID_OVERRIDES: ManualOverride[] = ["AUTO", "ZONES", "BULL", "BOTH", "BEAR", "OFF"];

export function parseNiftyZones(data: Record<string, unknown>): NiftyZones {
  const zones: NiftyZones = {
    bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
    manualOverride: "AUTO",
    momentumLookbackMin: 10,
  };
  for (const key of ZONE_KEYS) {
    const v = data[key];
    zones[key] = typeof v === "number" && v > 0 ? v : null;
  }
  if (VALID_OVERRIDES.includes(data.manualOverride as ManualOverride)) {
    zones.manualOverride = data.manualOverride as ManualOverride;
  }
  const mlb = data.momentumLookbackMin;
  zones.momentumLookbackMin = typeof mlb === "number" && mlb > 0 ? mlb : null;
  return zones;
}

const PRICE_HISTORY_MAX = 35;

export async function loadNiftyPriceHistory(db: Firestore): Promise<PricePoint[]> {
  try {
    const snap = await db.doc("config/nifty_auto_status").get();
    if (!snap.exists) return [];
    const existing = snap.data()?.priceHistory;
    if (!Array.isArray(existing)) return [];
    return existing.filter(
      (p): p is PricePoint =>
        typeof p?.price === "number" && typeof p?.ts === "number",
    );
  } catch {
    return [];
  }
}

export function appendNiftyPriceHistory(
  existing: PricePoint[],
  niftyPrice: number | null,
  maxEntries: number = PRICE_HISTORY_MAX,
): PricePoint[] {
  let h = [...existing];
  if (niftyPrice !== null) {
    h.push({ price: niftyPrice, ts: Date.now() });
  }
  if (h.length > maxEntries) h = h.slice(-maxEntries);
  return h;
}

function checkMomentum(
  history: PricePoint[],
  lookbackMs: number,
  direction: "BULL" | "BEAR",
): { passed: boolean; detail: string } | null {
  const now = Date.now();
  const window = history
    .filter((p) => now - p.ts <= lookbackMs)
    .sort((a, b) => a.ts - b.ts);

  if (window.length < 3) return null;

  const half      = Math.floor(window.length / 2);
  const olderHalf = window.slice(0, half);
  const newerHalf = window.slice(-half);

  const avgOlder = olderHalf.reduce((s, p) => s + p.price, 0) / olderHalf.length;
  const avgNewer = newerHalf.reduce((s, p) => s + p.price, 0) / newerHalf.length;

  const fmt    = (n: number) => `₹${Math.round(n).toLocaleString()}`;
  const detail = `${fmt(avgOlder)} → ${fmt(avgNewer)} over ${Math.round(lookbackMs / 60000)}min`;

  if (direction === "BULL") return { passed: avgNewer > avgOlder, detail };
  if (direction === "BEAR") return { passed: avgNewer < avgOlder, detail };
  return null;
}

export function computeNiftyAutoSwitch(
  niftyPrice:   number | null,
  zones:        NiftyZones,
  priceHistory: PricePoint[] = [],
): { simEnabled: boolean; directionBias: "BULL" | "BEAR" | "BOTH"; reason: string } {
  if (zones.manualOverride === "BULL") return { simEnabled: true,  directionBias: "BULL", reason: "BULL ACTIVE — manual override" };
  if (zones.manualOverride === "BOTH") return { simEnabled: true,  directionBias: "BOTH", reason: "BULL + BEAR ACTIVE — manual override" };
  if (zones.manualOverride === "BEAR") return { simEnabled: true,  directionBias: "BEAR", reason: "BEAR ACTIVE — manual override" };
  if (zones.manualOverride === "OFF")  return { simEnabled: false, directionBias: "BOTH", reason: "OFF — manual override" };

  if (niftyPrice === null) {
    return { simEnabled: false, directionBias: "BOTH", reason: "OFF — Nifty price unavailable" };
  }

  const { bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneHigh, bearZoneLow, bearExitBelow, momentumLookbackMin } = zones;
  const fmt        = (n: number) => `₹${n.toLocaleString()}`;
  const lookbackMs = momentumLookbackMin ? momentumLookbackMin * 60_000 : null;

  // ── BULL ──────────────────────────────────────────────────────────────────
  const bullActive =
    bullZoneLow !== null && bullExitAbove !== null &&
    niftyPrice >= bullZoneLow && niftyPrice <= bullExitAbove;

  if (bullActive) {
    const inZone = bullZoneHigh !== null && niftyPrice <= bullZoneHigh;
    const posLabel = inZone
      ? `Nifty ${fmt(niftyPrice)} in entry zone ${fmt(bullZoneLow!)}–${fmt(bullZoneHigh!)}`
      : `Nifty ${fmt(niftyPrice)} above zone, exit at ${fmt(bullExitAbove!)}`;

    if (lookbackMs) {
      const mom = checkMomentum(priceHistory, lookbackMs, "BULL");
      if (mom === null) {
        return { simEnabled: true, directionBias: "BULL", reason: `BULL ACTIVE — ${posLabel} (momentum: building…)` };
      }
      if (!mom.passed) {
        return { simEnabled: false, directionBias: "BOTH", reason: `BULL WAITING — ${posLabel} — momentum not confirmed yet (${mom.detail} ↓)` };
      }
      return { simEnabled: true, directionBias: "BULL", reason: `BULL ACTIVE — ${posLabel} — momentum ↑ (${mom.detail})` };
    }

    return { simEnabled: true, directionBias: "BULL", reason: `BULL ACTIVE — ${posLabel}` };
  }

  // ── BEAR ──────────────────────────────────────────────────────────────────
  const bearActive =
    bearExitBelow !== null && bearZoneHigh !== null &&
    niftyPrice >= bearExitBelow && niftyPrice <= bearZoneHigh;

  if (bearActive) {
    const inZone = bearZoneLow !== null && niftyPrice >= bearZoneLow;
    const posLabel = inZone
      ? `Nifty ${fmt(niftyPrice)} in entry zone ${fmt(bearZoneLow!)}–${fmt(bearZoneHigh!)}`
      : `Nifty ${fmt(niftyPrice)} below zone, exit at ${fmt(bearExitBelow!)}`;

    if (lookbackMs) {
      const mom = checkMomentum(priceHistory, lookbackMs, "BEAR");
      if (mom === null) {
        return { simEnabled: true, directionBias: "BEAR", reason: `BEAR ACTIVE — ${posLabel} (momentum: building…)` };
      }
      if (!mom.passed) {
        return { simEnabled: false, directionBias: "BOTH", reason: `BEAR WAITING — ${posLabel} — momentum not confirmed yet (${mom.detail} ↑)` };
      }
      return { simEnabled: true, directionBias: "BEAR", reason: `BEAR ACTIVE — ${posLabel} — momentum ↓ (${mom.detail})` };
    }

    return { simEnabled: true, directionBias: "BEAR", reason: `BEAR ACTIVE — ${posLabel}` };
  }

  // ── OFF ───────────────────────────────────────────────────────────────────
  if (bullExitAbove !== null && niftyPrice > bullExitAbove)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — Nifty ${fmt(niftyPrice)} above bull exit ${fmt(bullExitAbove)}` };
  if (bearExitBelow !== null && niftyPrice < bearExitBelow)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — Nifty ${fmt(niftyPrice)} below bear exit ${fmt(bearExitBelow)}` };
  if (bearZoneHigh !== null && niftyPrice > bearZoneHigh)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — Nifty ${fmt(niftyPrice)} above bear zone top ${fmt(bearZoneHigh)}` };
  if (bullZoneLow !== null && niftyPrice < bullZoneLow)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — Nifty ${fmt(niftyPrice)} below bull zone ${fmt(bullZoneLow)}` };

  const hasZones = [bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneLow, bearZoneHigh, bearExitBelow].some((v) => v !== null);
  return {
    simEnabled: false,
    directionBias: "BOTH",
    reason: hasZones ? `OFF — Nifty ${fmt(niftyPrice)} between zones` : "OFF — no Nifty zones configured",
  };
}

/**
 * Loads nifty_zones and merges suggested_nifty_zones when manualOverride === "AUTO".
 * Mirrors loadEffectiveHeatmapZones.
 */
export async function loadEffectiveNiftyZones(
  db: Firestore,
): Promise<{ zones: NiftyZones; autoZoneClearReason: AutoZoneClearReason | null }> {
  let zones = parseNiftyZones({});
  let autoZoneClearReason: AutoZoneClearReason | null = null;

  try {
    const snap = await db.doc(NIFTY_ZONES_DOC).get();
    if (snap.exists) zones = parseNiftyZones(snap.data() ?? {});
  } catch {}

  if (zones.manualOverride === "AUTO") {
    try {
      const sugSnap = await db.doc("config/suggested_nifty_zones").get();
      if (sugSnap.exists) {
        const s = sugSnap.data() as Record<string, unknown>;
        const computedAt = s.computedAt as string | undefined;
        const ageMs      = computedAt ? Date.now() - new Date(computedAt).getTime() : Infinity;
        const isStale    = ageMs > 12 * 60 * 60 * 1000;
        const hasZones   = s.bullZoneLow && s.bullZoneHigh && s.bearZoneLow && s.bearZoneHigh;
        const goodGap    = !s.insufficientGap;

        if (!isStale && hasZones && goodGap) {
          zones = {
            ...zones,
            bullZoneLow:  s.bullZoneLow  as number,
            bullZoneHigh: s.bullZoneHigh as number,
            bullExitAbove: (s.bullExitAbove as number | null) ?? null,
            bearZoneLow:  s.bearZoneLow  as number,
            bearZoneHigh: s.bearZoneHigh as number,
            bearExitBelow: (s.bearExitBelow as number | null) ?? null,
          };
        } else {
          if (!hasZones) autoZoneClearReason = "missing_suggested";
          else if (!goodGap) autoZoneClearReason = "insufficient_gap";
          else autoZoneClearReason = "stale";

          zones = { ...zones, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null };
        }
      } else {
        autoZoneClearReason = "missing_suggested";
        zones = { ...zones, bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null, bearZoneLow: null, bearZoneHigh: null, bearExitBelow: null };
      }
    } catch {}
  }

  return { zones, autoZoneClearReason };
}

/** Same idea as resolveHeatmapAutoStatusReason — clearer OFF line when AUTO drops suggested zones. */
export function resolveNiftyAutoStatusReason(
  zones: NiftyZones,
  computeReason: string,
  autoZoneClearReason: AutoZoneClearReason | null,
): string {
  if (zones.manualOverride !== "AUTO" && zones.manualOverride !== "ZONES") return computeReason;
  if (computeReason !== "OFF — no Nifty zones configured") return computeReason;
  if (autoZoneClearReason === "insufficient_gap") {
    return "OFF — strikes under 600 pts apart (clusters too close)";
  }
  if (autoZoneClearReason === "stale") {
    return "OFF — Nifty zones stale (>12h). Tap Refresh Zones.";
  }
  if (autoZoneClearReason === "missing_suggested") {
    return "OFF — no Nifty zones yet. Tap Refresh Zones.";
  }
  return computeReason;
}

import type { Firestore } from "firebase-admin/firestore";

export const HEATMAP_ZONES_DOC = "config/heatmap_zones";

export type ManualOverride = "AUTO" | "BULL" | "BOTH" | "BEAR" | "OFF";

export interface HeatmapZones {
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneHigh:        number | null;
  bearZoneLow:         number | null;
  bearExitBelow:       number | null;
  manualOverride:      ManualOverride;
  momentumLookbackMin: number | null; // null = momentum check disabled
  /** ±USD around each Deribit strike for AUTO zones; null → server default (500). */
  zoneHalfWidthUsd:    number | null;
}

export interface PricePoint {
  price: number;
  ts:    number; // unix ms
}

export const ZONE_KEYS: (keyof Omit<HeatmapZones, "manualOverride" | "momentumLookbackMin">)[] = [
  "bullZoneLow", "bullZoneHigh", "bullExitAbove",
  "bearZoneHigh", "bearZoneLow", "bearExitBelow",
];

export const VALID_OVERRIDES: ManualOverride[] = ["AUTO", "BULL", "BOTH", "BEAR", "OFF"];

export function parseZones(data: Record<string, unknown>): HeatmapZones {
  const zones: HeatmapZones = {
    bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
    manualOverride: "AUTO",
    momentumLookbackMin: 10,
    zoneHalfWidthUsd: null,
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
  const zh = data.zoneHalfWidthUsd;
  zones.zoneHalfWidthUsd =
    typeof zh === "number" && zh >= 50 && zh <= 3000 ? zh : null;
  return zones;
}

/** Rolling BTC samples for momentum (same cap as sync-simulator). */
const PRICE_HISTORY_MAX = 35;

export async function loadPriceHistoryFromHeatmapStatus(db: Firestore): Promise<PricePoint[]> {
  try {
    const statusSnap = await db.doc("config/heatmap_auto_status").get();
    if (!statusSnap.exists) return [];
    const existing = statusSnap.data()?.priceHistory;
    if (!Array.isArray(existing)) return [];
    return existing.filter(
      (p): p is PricePoint =>
        typeof p?.price === "number" && typeof p?.ts === "number",
    );
  } catch {
    return [];
  }
}

export function appendBtcPriceHistory(
  existing: PricePoint[],
  btcPrice: number | null,
  maxEntries: number = PRICE_HISTORY_MAX,
): PricePoint[] {
  let h = [...existing];
  if (btcPrice !== null) {
    h.push({ price: btcPrice, ts: Date.now() });
  }
  if (h.length > maxEntries) h = h.slice(-maxEntries);
  return h;
}

/** Why AUTO mode dropped Deribit zones (for clearer heatmap_auto_status line). */
export type AutoZoneClearReason =
  | null
  | "insufficient_gap"
  | "stale"
  | "missing_suggested";

export interface EffectiveHeatmapZonesResult {
  zones: HeatmapZones;
  /** Set when AUTO clears suggested zones so UI status is not generic "no zones configured". */
  autoZoneClearReason: AutoZoneClearReason;
}

/**
 * Effective zones for AUTO (merges Deribit suggested_zones when override is AUTO).
 * Mirrors sync-simulator so throttle and switch logic stay consistent.
 */
export async function loadEffectiveHeatmapZones(db: Firestore): Promise<EffectiveHeatmapZonesResult> {
  let heatmapZones = parseZones({});
  let autoZoneClearReason: AutoZoneClearReason = null;

  try {
    const zonesDoc = await db.doc(HEATMAP_ZONES_DOC).get();
    if (zonesDoc.exists) {
      heatmapZones = parseZones(zonesDoc.data() ?? {});
    }
  } catch {}

  if (heatmapZones.manualOverride === "AUTO") {
    try {
      const suggestedSnap = await db.doc("config/suggested_zones").get();
      if (suggestedSnap.exists) {
        const s = suggestedSnap.data() as Record<string, unknown>;
        const computedAt = s.computedAt as string | undefined;
        const ageMs = computedAt ? Date.now() - new Date(computedAt).getTime() : Infinity;
        const isStale = ageMs > 12 * 60 * 60 * 1000;
        const hasZones = s.bullZoneLow && s.bullZoneHigh && s.bearZoneLow && s.bearZoneHigh;
        const sufficientGap = !s.insufficientGap;

        if (!isStale && hasZones && sufficientGap) {
          heatmapZones = {
            ...heatmapZones,
            bullZoneLow: s.bullZoneLow as number,
            bullZoneHigh: s.bullZoneHigh as number,
            bullExitAbove: (s.bullExitAbove as number | null) ?? null,
            bearZoneLow: s.bearZoneLow as number,
            bearZoneHigh: s.bearZoneHigh as number,
            bearExitBelow: (s.bearExitBelow as number | null) ?? null,
          };
        } else {
          if (!hasZones) autoZoneClearReason = "missing_suggested";
          else if (!sufficientGap) autoZoneClearReason = "insufficient_gap";
          else if (isStale) autoZoneClearReason = "stale";
          else autoZoneClearReason = "stale";

          heatmapZones = {
            ...heatmapZones,
            bullZoneLow: null,
            bullZoneHigh: null,
            bullExitAbove: null,
            bearZoneLow: null,
            bearZoneHigh: null,
            bearExitBelow: null,
          };
        }
      } else {
        autoZoneClearReason = "missing_suggested";
        heatmapZones = {
          ...heatmapZones,
          bullZoneLow: null,
          bullZoneHigh: null,
          bullExitAbove: null,
          bearZoneLow: null,
          bearZoneHigh: null,
          bearExitBelow: null,
        };
      }
    } catch {
      /* keep cleared or partial */
    }
  }

  return { zones: heatmapZones, autoZoneClearReason };
}

/** Maps generic AUTO "no zones" to why Deribit zones were dropped (clearer status line). */
export function resolveHeatmapAutoStatusReason(
  zones: HeatmapZones,
  computeReason: string,
  autoZoneClearReason: AutoZoneClearReason,
): string {
  if (zones.manualOverride !== "AUTO") return computeReason;
  if (computeReason !== "OFF — no heatmap zones configured") return computeReason;
  if (autoZoneClearReason === "insufficient_gap") {
    return "OFF — strikes under $2,500 apart (Deribit clusters too close)";
  }
  if (autoZoneClearReason === "stale") {
    return "OFF — Deribit zones stale (>12h). Tap Refresh Zones.";
  }
  if (autoZoneClearReason === "missing_suggested") {
    return "OFF — no Deribit zones yet. Tap Refresh Zones.";
  }
  return computeReason;
}

/**
 * Check momentum direction over a price history window.
 * Splits the window in half: if avg(newer) > avg(older) → trending up.
 * Returns null if insufficient data (caller should skip the check, not block).
 */
function checkMomentum(
  history: PricePoint[],
  lookbackMs: number,
  direction: "BULL" | "BEAR",
): { passed: boolean; detail: string } | null {
  const now = Date.now();
  const window = history
    .filter((p) => now - p.ts <= lookbackMs)
    .sort((a, b) => a.ts - b.ts);

  if (window.length < 3) return null; // not enough data — skip check

  const half      = Math.floor(window.length / 2);
  const olderHalf = window.slice(0, half);
  const newerHalf = window.slice(-half);

  const avgOlder = olderHalf.reduce((s, p) => s + p.price, 0) / olderHalf.length;
  const avgNewer = newerHalf.reduce((s, p) => s + p.price, 0) / newerHalf.length;

  const fmt    = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const detail = `${fmt(avgOlder)} → ${fmt(avgNewer)} over ${Math.round(lookbackMs / 60000)}min`;

  if (direction === "BULL") return { passed: avgNewer > avgOlder, detail };
  if (direction === "BEAR") return { passed: avgNewer < avgOlder, detail };
  return null;
}

export function computeAutoSwitch(
  btcPrice:     number | null,
  zones:        HeatmapZones,
  priceHistory: PricePoint[] = [],
): { simEnabled: boolean; directionBias: "BULL" | "BEAR" | "BOTH"; reason: string } {
  // Manual override takes full priority
  if (zones.manualOverride === "BULL") return { simEnabled: true,  directionBias: "BULL", reason: "BULL ACTIVE — manual override" };
  if (zones.manualOverride === "BOTH") return { simEnabled: true,  directionBias: "BOTH", reason: "BULL + BEAR ACTIVE — manual override" };
  if (zones.manualOverride === "BEAR") return { simEnabled: true,  directionBias: "BEAR", reason: "BEAR ACTIVE — manual override" };
  if (zones.manualOverride === "OFF")  return { simEnabled: false, directionBias: "BOTH", reason: "OFF — manual override" };

  if (btcPrice === null) {
    return { simEnabled: false, directionBias: "BOTH", reason: "OFF — BTC price unavailable" };
  }

  const { bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneHigh, bearZoneLow, bearExitBelow, momentumLookbackMin } = zones;
  const fmt        = (n: number) => `$${n.toLocaleString()}`;
  const lookbackMs = momentumLookbackMin ? momentumLookbackMin * 60_000 : null;

  // ── BULL ──────────────────────────────────────────────────────────────────
  const bullActive =
    bullZoneLow !== null && bullExitAbove !== null &&
    btcPrice >= bullZoneLow && btcPrice <= bullExitAbove;

  if (bullActive) {
    const inZone = bullZoneHigh !== null && btcPrice <= bullZoneHigh;
    const posLabel = inZone
      ? `BTC ${fmt(btcPrice)} in entry zone ${fmt(bullZoneLow!)}–${fmt(bullZoneHigh!)}`
      : `BTC ${fmt(btcPrice)} above zone, exit at ${fmt(bullExitAbove!)}`;

    // Momentum check
    if (lookbackMs) {
      const mom = checkMomentum(priceHistory, lookbackMs, "BULL");
      if (mom === null) {
        // Not enough history yet — activate anyway (don't penalise early start)
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
    btcPrice >= bearExitBelow && btcPrice <= bearZoneHigh;

  if (bearActive) {
    const inZone = bearZoneLow !== null && btcPrice >= bearZoneLow;
    const posLabel = inZone
      ? `BTC ${fmt(btcPrice)} in entry zone ${fmt(bearZoneLow!)}–${fmt(bearZoneHigh!)}`
      : `BTC ${fmt(btcPrice)} below zone, exit at ${fmt(bearExitBelow!)}`;

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
  if (bullExitAbove !== null && btcPrice > bullExitAbove)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} above bull exit ${fmt(bullExitAbove)}` };
  if (bearExitBelow !== null && btcPrice < bearExitBelow)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} below bear exit ${fmt(bearExitBelow)}` };
  if (bearZoneHigh !== null && btcPrice > bearZoneHigh)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} above bear zone top ${fmt(bearZoneHigh)}` };
  if (bullZoneLow !== null && btcPrice < bullZoneLow)
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} below bull zone ${fmt(bullZoneLow)}` };

  const hasZones = [bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneLow, bearZoneHigh, bearExitBelow].some((v) => v !== null);
  return {
    simEnabled: false,
    directionBias: "BOTH",
    reason: hasZones ? `OFF — BTC ${fmt(btcPrice)} between zones` : "OFF — no heatmap zones configured",
  };
}

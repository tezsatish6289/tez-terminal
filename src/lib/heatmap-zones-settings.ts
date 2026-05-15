import type { Firestore } from "firebase-admin/firestore";

export const HEATMAP_ZONES_DOC = "config/heatmap_zones";

/** AUTO  = Deribit OI computed zones, price-based switching.
 *  OFF   = Emergency kill — no new trades regardless of price. */
export type ManualOverride = "AUTO" | "OFF";

export interface HeatmapZones {
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneHigh:        number | null;
  bearZoneLow:         number | null;
  bearExitBelow:       number | null;
  manualOverride:      ManualOverride;
  /** Minutes BTC must hold the zone floor/ceiling without new lows/highs before trades open.
   *  null = no confirmation required (activate immediately on zone entry). */
  zoneConfirmMinutes:  number | null;
  /** ±USD around each Deribit strike for AUTO zones; null → server default (500). */
  zoneHalfWidthUsd:    number | null;
  /** Close open trades when BTC is within this many $ of today's max pain (one-sided zones only). null → default 200. */
  maxPainProximityUsd: number | null;
  /** Minimum USD distance between any candidate option STRIKE PRICE and
   *  today's (day-0) max pain price when selecting AUTO bull/bear zones.
   *  Strikes inside the band are skipped at selection time, so the simulator
   *  never picks a strike whose price sits in the erratic max-pain region.
   *  Default $1,000. Set to 0 to disable the filter. */
  maxPainMinDistanceUsd: number | null;
}

export interface PricePoint {
  price: number;
  ts:    number; // unix ms
}

export const ZONE_KEYS: (keyof Omit<HeatmapZones, "manualOverride" | "zoneConfirmMinutes">)[] = [
  "bullZoneLow", "bullZoneHigh", "bullExitAbove",
  "bearZoneHigh", "bearZoneLow", "bearExitBelow",
];

export const VALID_OVERRIDES: ManualOverride[] = ["AUTO", "OFF"];

export function parseZones(data: Record<string, unknown>): HeatmapZones {
  const zones: HeatmapZones = {
    bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
    manualOverride: "AUTO",
    zoneConfirmMinutes: 15,
    zoneHalfWidthUsd: null,
    maxPainProximityUsd: null,
    maxPainMinDistanceUsd: null,
  };
  for (const key of ZONE_KEYS) {
    const v = data[key];
    zones[key] = typeof v === "number" && v > 0 ? v : null;
  }
  if (VALID_OVERRIDES.includes(data.manualOverride as ManualOverride)) {
    zones.manualOverride = data.manualOverride as ManualOverride;
  }
  // zoneConfirmMinutes: 5–60 min range; null = no confirmation gate
  const zcm = data.zoneConfirmMinutes;
  zones.zoneConfirmMinutes = typeof zcm === "number" && zcm >= 5 && zcm <= 60 ? zcm : 15;
  // Legacy: if old momentumLookbackMin exists and new field absent, migrate value
  if (data.zoneConfirmMinutes === undefined && typeof data.momentumLookbackMin === "number") {
    zones.zoneConfirmMinutes = 15; // reset to saner default rather than migrating raw minutes
  }
  const zh = data.zoneHalfWidthUsd;
  zones.zoneHalfWidthUsd =
    typeof zh === "number" && zh >= 50 && zh <= 3000 ? zh : null;
  const mp = data.maxPainProximityUsd;
  zones.maxPainProximityUsd =
    typeof mp === "number" && mp >= 50 && mp <= 2000 ? mp : null;
  const mpMinDist = data.maxPainMinDistanceUsd;
  zones.maxPainMinDistanceUsd =
    typeof mpMinDist === "number" && mpMinDist >= 0 && mpMinDist <= 3000 ? mpMinDist : null;
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

        // A zone is valid if at least one side (bull OR bear) is fully configured.
        // One-sided zones are intentional — e.g. bear zone rejected due to no TP target.
        const hasBullZone = !!(s.bullZoneLow && s.bullZoneHigh);
        const hasBearZone = !!(s.bearZoneLow && s.bearZoneHigh);
        const hasZones = hasBullZone || hasBearZone;

        // Gap check only applies when both sides are present.
        const sufficientGap = !(s.insufficientGap && hasBullZone && hasBearZone);

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
 * Rolling zone confirmation check.
 *
 * Uses the last `confirmMinutes` minutes of BTC price history to verify:
 *   1. Every price stayed on the right side of the zone floor/ceiling.
 *   2. No new lows (BULL) / no new highs (BEAR) in the second half vs first half.
 *
 * Returns null when there is insufficient history — caller should NOT block trading
 * (benefit of the doubt on early start / cold cache).
 */
function checkZoneConfirmation(
  history:        PricePoint[],
  confirmMinutes: number,
  floor:          number, // bullZoneLow for BULL, bearZoneHigh for BEAR
  direction:      "BULL" | "BEAR",
): { confirmed: boolean; minutesHeld: number; detail: string } | null {
  const now       = Date.now();
  const windowMs  = confirmMinutes * 60_000;
  const fmt       = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const window = history
    .filter((p) => now - p.ts <= windowMs)
    .sort((a, b) => a.ts - b.ts);

  // Need at least half the expected points to make a meaningful call.
  // If history is too thin (cold cache / first run), skip the gate.
  const minRequired = Math.max(3, Math.floor(confirmMinutes / 2));
  if (window.length < minRequired) return null; // not enough data — let it through

  const minutesHeld = Math.round(window.length); // approx 1 point per minute

  // ── Check 1: zone floor never broken ─────────────────────────────────────
  const aboveFloor = direction === "BULL"
    ? window.every((p) => p.price >= floor)
    : window.every((p) => p.price <= floor);

  if (!aboveFloor) {
    const worst = direction === "BULL"
      ? Math.min(...window.map((p) => p.price))
      : Math.max(...window.map((p) => p.price));
    return {
      confirmed: false, minutesHeld,
      detail: `zone ${direction === "BULL" ? "floor" : "ceiling"} broken — ${fmt(worst)} breached ${fmt(floor)}`,
    };
  }

  // ── Check 2: no new lows (BULL) / no new highs (BEAR) ───────────────────
  const half      = Math.floor(window.length / 2);
  const firstHalf = window.slice(0, half);
  const lastHalf  = window.slice(-half);

  if (direction === "BULL") {
    const minFirst = Math.min(...firstHalf.map((p) => p.price));
    const minLast  = Math.min(...lastHalf.map((p) => p.price));
    if (minLast < minFirst) {
      return {
        confirmed: false, minutesHeld,
        detail: `still making lower lows (${fmt(minFirst)} → ${fmt(minLast)})`,
      };
    }
  } else {
    const maxFirst = Math.max(...firstHalf.map((p) => p.price));
    const maxLast  = Math.max(...lastHalf.map((p) => p.price));
    if (maxLast > maxFirst) {
      return {
        confirmed: false, minutesHeld,
        detail: `still making higher highs (${fmt(maxFirst)} → ${fmt(maxLast)})`,
      };
    }
  }

  return { confirmed: true, minutesHeld, detail: `held ${confirmMinutes} min, no new ${direction === "BULL" ? "lows" : "highs"}` };
}

export function computeAutoSwitch(
  btcPrice:     number | null,
  zones:        HeatmapZones,
  priceHistory: PricePoint[] = [],
): { simEnabled: boolean; directionBias: "BULL" | "BEAR" | "BOTH"; reason: string } {
  // Force Off — emergency kill switch
  if (zones.manualOverride === "OFF") {
    return { simEnabled: false, directionBias: "BOTH", reason: "OFF — manual override" };
  }

  if (btcPrice === null) {
    return { simEnabled: false, directionBias: "BOTH", reason: "OFF — BTC price unavailable" };
  }

  const { bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneHigh, bearZoneLow, bearExitBelow, zoneConfirmMinutes } = zones;
  const fmt = (n: number) => `$${n.toLocaleString()}`;

  // ── BULL ──────────────────────────────────────────────────────────────────
  const bullActive =
    bullZoneLow !== null && bullExitAbove !== null &&
    btcPrice >= bullZoneLow && btcPrice <= bullExitAbove;

  if (bullActive) {
    const inZone   = bullZoneHigh !== null && btcPrice <= bullZoneHigh;
    const posLabel = inZone
      ? `BTC ${fmt(btcPrice)} in entry zone ${fmt(bullZoneLow!)}–${fmt(bullZoneHigh!)}`
      : `BTC ${fmt(btcPrice)} above zone, exit at ${fmt(bullExitAbove!)}`;

    if (zoneConfirmMinutes) {
      const check = checkZoneConfirmation(priceHistory, zoneConfirmMinutes, bullZoneLow!, "BULL");
      if (check === null) {
        // Not enough history yet — activate anyway (cold cache / first run)
        return { simEnabled: true, directionBias: "BULL", reason: `BULL ACTIVE — ${posLabel} (confirmation: building history…)` };
      }
      if (!check.confirmed) {
        return {
          simEnabled: false, directionBias: "BOTH",
          reason: `BULL CONFIRMING (${check.minutesHeld} / ${zoneConfirmMinutes} min) — ${posLabel} — ${check.detail}`,
        };
      }
      return { simEnabled: true, directionBias: "BULL", reason: `BULL ACTIVE — zone confirmed (${zoneConfirmMinutes} min) — ${posLabel}` };
    }

    return { simEnabled: true, directionBias: "BULL", reason: `BULL ACTIVE — ${posLabel}` };
  }

  // ── BEAR ──────────────────────────────────────────────────────────────────
  const bearActive =
    bearExitBelow !== null && bearZoneHigh !== null &&
    btcPrice >= bearExitBelow && btcPrice <= bearZoneHigh;

  if (bearActive) {
    const inZone   = bearZoneLow !== null && btcPrice >= bearZoneLow;
    const posLabel = inZone
      ? `BTC ${fmt(btcPrice)} in entry zone ${fmt(bearZoneLow!)}–${fmt(bearZoneHigh!)}`
      : `BTC ${fmt(btcPrice)} below zone, exit at ${fmt(bearExitBelow!)}`;

    if (zoneConfirmMinutes) {
      const check = checkZoneConfirmation(priceHistory, zoneConfirmMinutes, bearZoneHigh!, "BEAR");
      if (check === null) {
        return { simEnabled: true, directionBias: "BEAR", reason: `BEAR ACTIVE — ${posLabel} (confirmation: building history…)` };
      }
      if (!check.confirmed) {
        return {
          simEnabled: false, directionBias: "BOTH",
          reason: `BEAR CONFIRMING (${check.minutesHeld} / ${zoneConfirmMinutes} min) — ${posLabel} — ${check.detail}`,
        };
      }
      return { simEnabled: true, directionBias: "BEAR", reason: `BEAR ACTIVE — zone confirmed (${zoneConfirmMinutes} min) — ${posLabel}` };
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

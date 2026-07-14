import type { Firestore } from "firebase-admin/firestore";
import { checkZoneConfirmation as sharedCheckZoneConfirmation } from "./zone-bot-engine";

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
  /** ±USD around each Deribit strike for AUTO zones; null → server default (500).
   *  @deprecated As of 2026-05-19 the suggester auto-derives half-width per call
   *  from ATM IV. This field is preserved for back-compat with old Firestore docs
   *  and the UI input but the value is ignored by `computeOptionsZones`. */
  zoneHalfWidthUsd:    number | null;

  // ── v2 regime context (read from suggester; not user-editable) ─────────
  /** Suggester's verdict on whether BULL entries are safe right now. Pulled
   *  from `config/suggested_zones` in `loadEffectiveHeatmapZones`. Undefined
   *  on legacy docs — treated as permissive default. */
  bullActionable?:      boolean;
  bearActionable?:      boolean;
  inPanicRegime?:       boolean;
  signalConflict?:      boolean;
  notActionableReason?: string | null;
}

export interface PricePoint {
  price: number;
  ts:    number; // unix ms
}

/** Keys that hold the six zone band prices (`number | null`). Narrower
 *  than `keyof HeatmapZones` so the parser loop can assign uniformly —
 *  HeatmapZones now also carries booleans + strings (v2 regime flags). */
export type ZoneKey =
  | "bullZoneLow" | "bullZoneHigh" | "bullExitAbove"
  | "bearZoneHigh" | "bearZoneLow" | "bearExitBelow";

export const ZONE_KEYS: ZoneKey[] = [
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
        // One-sided zones are intentional — e.g. bear zone rejected due to no
        // TP target (zone center too close to today's max pain, ≥ 2 × halfWidth
        // gap required — see options-zones.ts `minTpRoomUsd`).
        //
        // The bull-vs-bear-bottom corridor gate (`insufficientGap`) was removed
        // on 2026-05-23: the per-side TP-room check already guarantees enough
        // runway from each zone to max pain, which is the substantive concern.
        // A separate hardcoded $2,500 corridor check on top was BTC-centric,
        // didn't scale to ETH/SOL/XRP, and was geometrically redundant when
        // both sides satisfy 2 × halfWidth to max pain.
        const hasBullZone = !!(s.bullZoneLow && s.bullZoneHigh);
        const hasBearZone = !!(s.bearZoneLow && s.bearZoneHigh);
        const hasZones = hasBullZone || hasBearZone;

        if (!isStale && hasZones) {
          heatmapZones = {
            ...heatmapZones,
            bullZoneLow: s.bullZoneLow as number,
            bullZoneHigh: s.bullZoneHigh as number,
            bullExitAbove: (s.bullExitAbove as number | null) ?? null,
            bearZoneLow: s.bearZoneLow as number,
            bearZoneHigh: s.bearZoneHigh as number,
            bearExitBelow: (s.bearExitBelow as number | null) ?? null,
            // v2 regime flags — passed through verbatim so computeAutoSwitch
            // can consult them. Undefined when reading legacy docs.
            bullActionable:      typeof s.bullActionable === "boolean" ? s.bullActionable : undefined,
            bearActionable:      typeof s.bearActionable === "boolean" ? s.bearActionable : undefined,
            inPanicRegime:       typeof s.inPanicRegime  === "boolean" ? s.inPanicRegime  : undefined,
            signalConflict:      typeof s.signalConflict === "boolean" ? s.signalConflict : undefined,
            notActionableReason: typeof s.notActionableReason === "string"
                                   ? (s.notActionableReason as string) : null,
          };
        } else {
          if (!hasZones) autoZoneClearReason = "missing_suggested";
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
 * Pattern-bot zone confirmation check — thin wrapper over the shared
 * `checkZoneConfirmation` in `zone-bot-engine.ts`. We pass `Date.now()`
 * for the clock and let the engine's CONFIRMATION_NOISE_PCT_OF_SPOT
 * default decide the noise floor (anchored to the floor price itself).
 *
 * Returning the same shape as before so the call sites below don't churn.
 */
function checkZoneConfirmation(
  history:        PricePoint[],
  confirmMinutes: number,
  floor:          number,
  direction:      "BULL" | "BEAR",
): { confirmed: boolean; minutesHeld: number; detail: string } | null {
  return sharedCheckZoneConfirmation(
    history,
    confirmMinutes,
    floor,
    direction,
    Date.now(),
  );
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

  // ── Regime gates (suggester-provided; ignored on legacy docs) ──────────
  // Mirrors `evaluateZoneBot`. Panic IV suppresses fresh entries.
  // (signalConflict retired 2026-07-14 — no longer blocks.)
  if (zones.inPanicRegime) {
    return {
      simEnabled: false,
      directionBias: "BOTH",
      reason: zones.notActionableReason ?? "OFF — panic regime (entries suppressed)",
    };
  }

  const { bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneHigh, bearZoneLow, bearExitBelow, zoneConfirmMinutes } = zones;
  const fmt = (n: number) => `$${n.toLocaleString()}`;

  // ── BULL ──────────────────────────────────────────────────────────────────
  const bullActive =
    bullZoneLow !== null && bullExitAbove !== null &&
    btcPrice >= bullZoneLow && btcPrice <= bullExitAbove;

  if (bullActive) {
    // Suggester actionable veto — when explicitly false (e.g. magnet doesn't
    // pull up, TP-room too small), don't fire even if price sits in band.
    if (zones.bullActionable === false) {
      return {
        simEnabled: false,
        directionBias: "BOTH",
        reason: zones.notActionableReason ?? `OFF — BULL zone present but not actionable`,
      };
    }

    const inZone   = bullZoneHigh !== null && btcPrice <= bullZoneHigh;
    const posLabel = inZone
      ? `BTC ${fmt(btcPrice)} in entry zone ${fmt(bullZoneLow!)}–${fmt(bullZoneHigh!)}`
      : `BTC ${fmt(btcPrice)} above zone, exit at ${fmt(bullExitAbove!)}`;

    if (zoneConfirmMinutes) {
      const check = checkZoneConfirmation(priceHistory, zoneConfirmMinutes, bullZoneLow!, "BULL");
      if (check === null) {
        // Cold cache — hold OFF instead of failing open. The legacy "let it
        // through" behaviour caused the May-14 cascade (13 sequential SLs)
        // where the pattern bot fired BULL trades on incomplete history.
        // Mirrors the zone-bot engine's IDLE-on-cold behaviour.
        return {
          simEnabled: false,
          directionBias: "BOTH",
          reason: `OFF — BULL confirming: building history (${priceHistory.length}/${zoneConfirmMinutes} samples)`,
        };
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
    if (zones.bearActionable === false) {
      return {
        simEnabled: false,
        directionBias: "BOTH",
        reason: zones.notActionableReason ?? `OFF — BEAR zone present but not actionable`,
      };
    }

    const inZone   = bearZoneLow !== null && btcPrice >= bearZoneLow;
    const posLabel = inZone
      ? `BTC ${fmt(btcPrice)} in entry zone ${fmt(bearZoneLow!)}–${fmt(bearZoneHigh!)}`
      : `BTC ${fmt(btcPrice)} below zone, exit at ${fmt(bearExitBelow!)}`;

    if (zoneConfirmMinutes) {
      const check = checkZoneConfirmation(priceHistory, zoneConfirmMinutes, bearZoneHigh!, "BEAR");
      if (check === null) {
        return {
          simEnabled: false,
          directionBias: "BOTH",
          reason: `OFF — BEAR confirming: building history (${priceHistory.length}/${zoneConfirmMinutes} samples)`,
        };
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

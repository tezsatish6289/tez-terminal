import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const ZONES_DOC = "config/heatmap_zones";

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
}

export interface PricePoint {
  price: number;
  ts:    number; // unix ms
}

const ZONE_KEYS: (keyof Omit<HeatmapZones, "manualOverride" | "momentumLookbackMin">)[] = [
  "bullZoneLow", "bullZoneHigh", "bullExitAbove",
  "bearZoneHigh", "bearZoneLow", "bearExitBelow",
];

const VALID_OVERRIDES: ManualOverride[] = ["AUTO", "BULL", "BOTH", "BEAR", "OFF"];

export function parseZones(data: Record<string, unknown>): HeatmapZones {
  const zones: HeatmapZones = {
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

export async function GET() {
  const db   = getAdminFirestore();
  const snap = await db.doc(ZONES_DOC).get();
  return NextResponse.json(parseZones(snap.exists ? (snap.data() ?? {}) : {}));
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db   = getAdminFirestore();

  const update: Record<string, unknown> = {};
  for (const key of ZONE_KEYS) {
    if (key in body) {
      const v = body[key];
      update[key] = typeof v === "number" && v > 0 ? v : null;
    }
  }
  if (VALID_OVERRIDES.includes(body.manualOverride)) {
    update.manualOverride = body.manualOverride;
  }
  if ("momentumLookbackMin" in body) {
    const v = body.momentumLookbackMin;
    update.momentumLookbackMin = typeof v === "number" && v > 0 ? v : null;
  }

  await db.doc(ZONES_DOC).set({ ...update, updatedAt: new Date().toISOString() }, { merge: true });
  return NextResponse.json({ success: true, saved: update });
}

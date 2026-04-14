import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const ZONES_DOC = "config/heatmap_zones";

export type ManualOverride = "AUTO" | "BULL" | "BOTH" | "BEAR" | "OFF";

export interface HeatmapZones {
  bullZoneLow:    number | null;  // BTC must be above this to trade BULL
  bullZoneHigh:   number | null;  // BTC must be below this to trade BULL
  bullExitAbove:  number | null;  // price above this → BULL done, sim OFF
  bearZoneHigh:   number | null;  // BTC must be below this to trade BEAR
  bearZoneLow:    number | null;  // BTC must be above this to trade BEAR
  bearExitBelow:  number | null;  // price below this → BEAR done, sim OFF
  manualOverride: ManualOverride; // AUTO = use zones; BULL/BEAR/OFF = force
}

const ZONE_KEYS: (keyof Omit<HeatmapZones, "manualOverride">)[] = [
  "bullZoneLow", "bullZoneHigh", "bullExitAbove",
  "bearZoneHigh", "bearZoneLow", "bearExitBelow",
];

const VALID_OVERRIDES: ManualOverride[] = ["AUTO", "BULL", "BOTH", "BEAR", "OFF"];

function parseZones(data: Record<string, unknown>): HeatmapZones {
  const zones: HeatmapZones = {
    bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
    manualOverride: "AUTO",
  };
  for (const key of ZONE_KEYS) {
    const v = data[key];
    zones[key] = typeof v === "number" && v > 0 ? v : null;
  }
  if (VALID_OVERRIDES.includes(data.manualOverride as ManualOverride)) {
    zones.manualOverride = data.manualOverride as ManualOverride;
  }
  return zones;
}

export function computeAutoSwitch(
  btcPrice: number | null,
  zones: HeatmapZones,
): { simEnabled: boolean; directionBias: "BULL" | "BEAR" | "BOTH"; reason: string } {
  // Manual override takes full priority over zone logic
  if (zones.manualOverride === "BULL") {
    return { simEnabled: true,  directionBias: "BULL", reason: "BULL ACTIVE — manual override" };
  }
  if (zones.manualOverride === "BOTH") {
    return { simEnabled: true,  directionBias: "BOTH", reason: "BULL + BEAR ACTIVE — manual override" };
  }
  if (zones.manualOverride === "BEAR") {
    return { simEnabled: true,  directionBias: "BEAR", reason: "BEAR ACTIVE — manual override" };
  }
  if (zones.manualOverride === "OFF") {
    return { simEnabled: false, directionBias: "BOTH", reason: "OFF — manual override" };
  }

  // AUTO mode — use BTC price vs zones
  if (btcPrice === null) {
    return { simEnabled: false, directionBias: "BOTH", reason: "OFF — BTC price unavailable" };
  }

  const { bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneHigh, bearZoneLow, bearExitBelow } = zones;
  const fmt = (n: number) => `$${n.toLocaleString()}`;

  // ── BULL ────────────────────────────────────────────────────────────────
  // Active range: bullZoneLow → bullExitAbove
  //   Zone is the entry trigger; simulator stays ON until exit is reached.
  //   Turns OFF when price falls below zone bottom OR rises above exit.
  const bullActive =
    bullZoneLow !== null && bullExitAbove !== null &&
    btcPrice >= bullZoneLow && btcPrice <= bullExitAbove;

  if (bullActive) {
    const inZone = bullZoneHigh !== null && btcPrice <= bullZoneHigh;
    return {
      simEnabled: true,
      directionBias: "BULL",
      reason: inZone
        ? `BULL ACTIVE — BTC ${fmt(btcPrice)} in entry zone ${fmt(bullZoneLow!)}–${fmt(bullZoneHigh!)}`
        : `BULL ACTIVE — BTC ${fmt(btcPrice)} above zone, exit at ${fmt(bullExitAbove!)}`,
    };
  }

  // ── BEAR ────────────────────────────────────────────────────────────────
  // Active range: bearExitBelow → bearZoneHigh
  //   Zone is the entry trigger; simulator stays ON until exit is reached.
  //   Turns OFF when price rises above zone top OR drops below exit.
  const bearActive =
    bearExitBelow !== null && bearZoneHigh !== null &&
    btcPrice >= bearExitBelow && btcPrice <= bearZoneHigh;

  if (bearActive) {
    const inZone = bearZoneLow !== null && btcPrice >= bearZoneLow;
    return {
      simEnabled: true,
      directionBias: "BEAR",
      reason: inZone
        ? `BEAR ACTIVE — BTC ${fmt(btcPrice)} in entry zone ${fmt(bearZoneLow!)}–${fmt(bearZoneHigh!)}`
        : `BEAR ACTIVE — BTC ${fmt(btcPrice)} below zone, exit at ${fmt(bearExitBelow!)}`,
    };
  }

  // ── OFF ─────────────────────────────────────────────────────────────────
  if (bullExitAbove !== null && btcPrice > bullExitAbove) {
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} above bull exit ${fmt(bullExitAbove)}` };
  }
  if (bearExitBelow !== null && btcPrice < bearExitBelow) {
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} below bear exit ${fmt(bearExitBelow)}` };
  }
  if (bearZoneHigh !== null && btcPrice > bearZoneHigh) {
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} above bear zone top ${fmt(bearZoneHigh)}` };
  }
  if (bullZoneLow !== null && btcPrice < bullZoneLow) {
    return { simEnabled: false, directionBias: "BOTH", reason: `OFF — BTC ${fmt(btcPrice)} below bull zone ${fmt(bullZoneLow)}` };
  }

  const hasZones = [bullZoneLow, bullZoneHigh, bullExitAbove, bearZoneLow, bearZoneHigh, bearExitBelow].some((v) => v !== null);
  return {
    simEnabled: false,
    directionBias: "BOTH",
    reason: hasZones
      ? `OFF — BTC ${fmt(btcPrice)} between zones`
      : "OFF — no heatmap zones configured",
  };
}

export async function GET() {
  const db = getAdminFirestore();
  const snap = await db.doc(ZONES_DOC).get();
  const zones = parseZones(snap.exists ? (snap.data() ?? {}) : {});
  return NextResponse.json(zones);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getAdminFirestore();

  const update: Record<string, number | null | string> = {};
  for (const key of ZONE_KEYS) {
    if (key in body) {
      const v = body[key];
      update[key] = typeof v === "number" && v > 0 ? v : null;
    }
  }
  if (VALID_OVERRIDES.includes(body.manualOverride)) {
    update.manualOverride = body.manualOverride;
  }

  await db.doc(ZONES_DOC).set(
    { ...update, updatedAt: new Date().toISOString() },
    { merge: true },
  );

  return NextResponse.json({ success: true, saved: update });
}

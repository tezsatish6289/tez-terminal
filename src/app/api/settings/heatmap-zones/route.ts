import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const ZONES_DOC = "config/heatmap_zones";

export type ManualOverride = "AUTO" | "BULL" | "BEAR" | "OFF";

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

const VALID_OVERRIDES: ManualOverride[] = ["AUTO", "BULL", "BEAR", "OFF"];

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

  // Bull zone active
  if (bullZoneLow !== null && bullZoneHigh !== null &&
      btcPrice >= bullZoneLow && btcPrice <= bullZoneHigh) {
    return {
      simEnabled: true,
      directionBias: "BULL",
      reason: `BULL ACTIVE — BTC $${btcPrice.toLocaleString()} in zone $${bullZoneLow.toLocaleString()}–$${bullZoneHigh.toLocaleString()}`,
    };
  }

  // Bear zone active
  if (bearZoneLow !== null && bearZoneHigh !== null &&
      btcPrice >= bearZoneLow && btcPrice <= bearZoneHigh) {
    return {
      simEnabled: true,
      directionBias: "BEAR",
      reason: `BEAR ACTIVE — BTC $${btcPrice.toLocaleString()} in zone $${bearZoneLow.toLocaleString()}–$${bearZoneHigh.toLocaleString()}`,
    };
  }

  // Bull exit triggered
  if (bullExitAbove !== null && btcPrice > bullExitAbove) {
    return {
      simEnabled: false,
      directionBias: "BOTH",
      reason: `OFF — BTC $${btcPrice.toLocaleString()} above bull exit $${bullExitAbove.toLocaleString()}`,
    };
  }

  // Bear exit triggered
  if (bearExitBelow !== null && btcPrice < bearExitBelow) {
    return {
      simEnabled: false,
      directionBias: "BOTH",
      reason: `OFF — BTC $${btcPrice.toLocaleString()} below bear exit $${bearExitBelow.toLocaleString()}`,
    };
  }

  // Price between zones or no zones configured
  const hasZones = Object.values(zones).some((v) => v !== null);
  return {
    simEnabled: false,
    directionBias: "BOTH",
    reason: hasZones
      ? `OFF — BTC $${btcPrice.toLocaleString()} outside all configured zones`
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

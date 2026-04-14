import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const ZONES_DOC = "config/heatmap_zones";

export interface HeatmapZones {
  bullZoneLow:   number | null;  // BTC must be above this to trade BULL
  bullZoneHigh:  number | null;  // BTC must be below this to trade BULL
  bullExitAbove: number | null;  // price above this → BULL done, sim OFF
  bearZoneHigh:  number | null;  // BTC must be below this to trade BEAR
  bearZoneLow:   number | null;  // BTC must be above this to trade BEAR
  bearExitBelow: number | null;  // price below this → BEAR done, sim OFF
}

const ZONE_KEYS: (keyof HeatmapZones)[] = [
  "bullZoneLow", "bullZoneHigh", "bullExitAbove",
  "bearZoneHigh", "bearZoneLow", "bearExitBelow",
];

function parseZones(data: Record<string, unknown>): HeatmapZones {
  const zones: HeatmapZones = {
    bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
    bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
  };
  for (const key of ZONE_KEYS) {
    const v = data[key];
    zones[key] = typeof v === "number" && v > 0 ? v : null;
  }
  return zones;
}

export function computeAutoSwitch(
  btcPrice: number | null,
  zones: HeatmapZones,
): { simEnabled: boolean; directionBias: "BULL" | "BEAR" | "BOTH"; reason: string } {
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

  const sanitized: Record<string, number | null> = {};
  for (const key of ZONE_KEYS) {
    if (key in body) {
      const v = body[key];
      sanitized[key] = typeof v === "number" && v > 0 ? v : null;
    }
  }

  await db.doc(ZONES_DOC).set(
    { ...sanitized, updatedAt: new Date().toISOString() },
    { merge: true },
  );

  return NextResponse.json({ success: true, saved: sanitized });
}

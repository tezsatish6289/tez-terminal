import type { Firestore } from "firebase-admin/firestore";
import {
  computeAutoSwitch,
  type HeatmapZones,
  type PricePoint,
} from "@/app/api/settings/heatmap-zones/route";

/**
 * When AUTO mode has BTC outside active bull/bear corridors and there are no
 * open simulator trades, run heavy scoring/sync work every other minute only.
 * Open trades or manual override → always full frequency.
 */
export function shouldThrottleHeavySimulatorCycle(
  zones: HeatmapZones,
  btcPrice: number | null,
  priceHistory: PricePoint[],
  hasOpenSimulatorTrade: boolean,
): boolean {
  if (hasOpenSimulatorTrade) return false;
  if (zones.manualOverride !== "AUTO") return false;
  const sw = computeAutoSwitch(btcPrice, zones, priceHistory);
  if (sw.simEnabled) return false;
  return Math.floor(Date.now() / 60_000) % 2 !== 0;
}

export async function hasAnyOpenSimulatorTrade(db: Firestore): Promise<boolean> {
  const snap = await db
    .collection("simulator_trades")
    .where("status", "==", "OPEN")
    .limit(1)
    .get();
  return !snap.empty;
}

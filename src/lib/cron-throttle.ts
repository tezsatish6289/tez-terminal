import type { Firestore } from "firebase-admin/firestore";
import {
  computeAutoSwitch,
  type AutoZoneClearReason,
  type HeatmapZones,
  type PricePoint,
} from "@/lib/heatmap-zones-settings";
import {
  computeNiftyAutoSwitch,
  type NiftyZones,
} from "@/lib/nifty-zones-settings";

/**
 * Skip expensive crypto sim work when policy already forbids new entries:
 * Force Off, strike gap too small (AUTO), or BTC between bull/bear bands (AUTO).
 * Used together with open-trade checks — never skip when any sim trade is open.
 */
export function shouldSkipCryptoHeavyPolicy(
  zones: HeatmapZones,
  autoZoneClearReason: AutoZoneClearReason,
  cryptoSwitchReason: string,
): boolean {
  if (zones.manualOverride === "OFF") return true;
  if (zones.manualOverride === "AUTO" && autoZoneClearReason === "insufficient_gap") {
    return true;
  }
  if (zones.manualOverride === "AUTO" && cryptoSwitchReason.includes("between zones")) {
    return true;
  }
  return false;
}

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

export async function hasOpenSimulatorTradeForAsset(
  db: Firestore,
  assetType: string,
): Promise<boolean> {
  const snap = await db
    .collection("simulator_trades")
    .where("status", "==", "OPEN")
    .where("assetType", "==", assetType)
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * When AUTO mode has Nifty outside active corridors and no open Indian sim trades,
 * alternate-minute heavy work (mirrors crypto throttle).
 */
export function shouldThrottleHeavyNiftySimulatorCycle(
  zones: NiftyZones,
  niftyPrice: number | null,
  priceHistory: PricePoint[],
  hasOpenIndianSimTrade: boolean,
): boolean {
  if (hasOpenIndianSimTrade) return false;
  if (zones.manualOverride !== "AUTO") return false;
  const sw = computeNiftyAutoSwitch(niftyPrice, zones, priceHistory);
  if (sw.simEnabled) return false;
  return Math.floor(Date.now() / 60_000) % 2 !== 0;
}

/** Mirrors shouldSkipCryptoHeavyPolicy using Nifty zones / reasons. */
export function shouldSkipNiftyHeavyPolicy(
  zones: NiftyZones,
  autoZoneClearReason: AutoZoneClearReason | null,
  niftySwitchReason: string,
): boolean {
  if (zones.manualOverride === "OFF") return true;
  if (zones.manualOverride === "AUTO" && autoZoneClearReason === "insufficient_gap") return true;
  if (zones.manualOverride === "AUTO" && niftySwitchReason.includes("between zones")) return true;
  return false;
}

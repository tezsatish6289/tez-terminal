/**
 * One-off: move a manual sim trade to another cockpit bot (botSource only).
 *
 *   npx tsx --env-file=.env.local scripts/migrate-manual-trade-bot.ts \
 *     sim-manual-xrp-1780208971728 crypto
 */
import { getAdminFirestore } from "../src/firebase/admin";
import {
  botSourceForCockpit,
  isManualSimTrade,
  zoneAssetFromBotId,
} from "../src/lib/manual-sim-open";
import type { CockpitBotId } from "../src/lib/sim-cockpit-bots";
import { BOT_SOURCE_PATTERN } from "../src/lib/bot-source-filter";
import { loadZoneBotState, saveZoneBotState, zoneBotStateDoc } from "../src/lib/zone-bot-state";
import type { ZoneBotAsset } from "../src/lib/zone-bot-config";
import type { SimTrade } from "../src/lib/simulator";

const ZONE_ASSETS: ZoneBotAsset[] = ["btc", "eth", "sol", "xrp"];

async function main() {
  const simTradeId = process.argv[2];
  const targetBotId = process.argv[3] as CockpitBotId | undefined;
  if (!simTradeId || !targetBotId) {
    console.error("Usage: migrate-manual-trade-bot.ts <simTradeId> <targetBotId>");
    process.exit(1);
  }

  const db = getAdminFirestore();
  const ref = db.collection("simulator_trades").doc(simTradeId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Trade not found");

  const trade = snap.data() as SimTrade;
  if (trade.status !== "OPEN") throw new Error("Trade must be OPEN");
  if (!isManualSimTrade(trade)) throw new Error("Not a manual trade");

  const newBotSource = botSourceForCockpit(targetBotId);
  const previousBotSource = trade.botSource ?? BOT_SOURCE_PATTERN;

  for (const asset of ZONE_ASSETS) {
    const state = await loadZoneBotState(db, asset);
    if (state.openTradeId === simTradeId) {
      await saveZoneBotState(db, asset, {
        ...state,
        openTradeId: null,
        reason: `Migrated to ${targetBotId}`,
        updatedAt: new Date().toISOString(),
      });
      console.log("cleared", zoneBotStateDoc(asset));
    }
  }

  await ref.update({ botSource: newBotSource });
  const liveSnap = await db.collection("live_trades").where("simTradeId", "==", simTradeId).get();
  for (const doc of liveSnap.docs) {
    await doc.ref.update({ botSource: newBotSource });
  }

  const targetZone = zoneAssetFromBotId(targetBotId);
  if (targetZone) {
    const state = await loadZoneBotState(db, targetZone);
    await saveZoneBotState(db, targetZone, { ...state, openTradeId: simTradeId });
  }

  console.log(JSON.stringify({
    simTradeId,
    symbol: trade.symbol,
    previousBotSource,
    botSource: newBotSource,
    liveTradesUpdated: liveSnap.size,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

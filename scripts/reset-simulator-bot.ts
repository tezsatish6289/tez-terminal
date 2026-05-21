/**
 * Reset one simulator bot source (e.g. BTC_ZONE): delete trades + zone state.
 *
 *   npx tsx --env-file=.env.local scripts/reset-simulator-bot.ts BTC_ZONE
 *   npx tsx --env-file=.env.local scripts/reset-simulator-bot.ts BTC_ZONE --dry
 */
import { getAdminFirestore } from "../src/firebase/admin";
import { BOT_SOURCE_BTC_ZONE } from "../src/lib/bot-source-filter";
import { emptyZoneBotState, zoneBotStateDoc } from "../src/lib/zone-bot-state";
import type { ZoneBotAsset } from "../src/lib/zone-bot-config";

const ZONE_ASSET: Record<string, ZoneBotAsset> = {
  BTC_ZONE: "btc",
  ETH_ZONE: "eth",
  SOL_ZONE: "sol",
};

async function main() {
  const botSource = process.argv[2] ?? BOT_SOURCE_BTC_ZONE;
  const dryRun = process.argv.includes("--dry");
  const zoneAsset = ZONE_ASSET[botSource];

  if (!zoneAsset) {
    console.error(`Unknown botSource: ${botSource}. Use BTC_ZONE, ETH_ZONE, or SOL_ZONE.`);
    process.exit(1);
  }

  const db = getAdminFirestore();
  const snap = await db.collection("simulator_trades").where("botSource", "==", botSource).get();

  const ids = snap.docs.map((d) => d.id);
  const symbols = new Set<string>();
  let openCount = 0;
  for (const d of snap.docs) {
    const sym = d.data().symbol as string | undefined;
    if (sym) symbols.add(sym);
    if (d.data().status === "OPEN") openCount++;
  }

  console.log(`${dryRun ? "[DRY]" : ""} ${botSource}: ${ids.length} trades (${openCount} open)`);

  if (dryRun) return;

  const chunk = 400;
  for (let i = 0; i < ids.length; i += chunk) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + chunk)) {
      batch.delete(db.collection("simulator_trades").doc(id));
    }
    await batch.commit();
  }

  let logsDeleted = 0;
  for (const sym of symbols) {
    const logSnap = await db.collection("simulator_logs").where("symbol", "==", sym).get();
    for (const logDoc of logSnap.docs) {
      await db.collection("simulator_logs").doc(logDoc.id).delete();
      logsDeleted++;
    }
  }

  await db.collection("config").doc(zoneBotStateDoc(zoneAsset)).set(emptyZoneBotState());

  console.log(`Done. Deleted ${ids.length} trades, ${logsDeleted} logs. Reset ${zoneBotStateDoc(zoneAsset)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

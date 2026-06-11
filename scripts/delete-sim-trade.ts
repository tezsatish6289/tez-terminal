/**
 * Delete one simulator trade and related Firestore rows.
 *
 *   npx tsx scripts/delete-sim-trade.ts sim-manual-btc-1781173062993 --dry
 *   npx tsx scripts/delete-sim-trade.ts sim-manual-btc-1781173062993
 */
import { getAdminFirestore } from "../src/firebase/admin";
import { deleteSimTradeRecords } from "../src/lib/admin/delete-sim-trade-records";

async function main() {
  const simTradeId = process.argv[2];
  const dryRun = process.argv.includes("--dry");
  const forceLiveDelete = process.argv.includes("--force-live");

  if (!simTradeId) {
    console.error("Usage: npx tsx scripts/delete-sim-trade.ts <simTradeId> [--dry] [--force-live]");
    process.exit(1);
  }

  const db = getAdminFirestore();
  const result = await deleteSimTradeRecords({
    db,
    simTradeId,
    dryRun,
    forceLiveDelete,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!dryRun) {
    const cronSecret = process.env.CRON_SECRET ?? "ANTIGRAVITY_SYNC_TOKEN_2024";
    const base = (process.env.APP_BASE_URL ?? "https://tezterminal.com").replace(/\/$/, "");
    const res = await fetch(
      `${base}/api/admin/reconcile-capital?key=${encodeURIComponent(cronSecret)}`,
    );
    console.log("reconcile:", await res.text());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { publishTrade } from "@/lib/blockchain-logger";
import { getWalletAddress, getWalletBalance, MIN_BALANCE_SOL } from "@/lib/solana-wallet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CRON 3: BLOCKCHAIN PUBLISHER
 *
 * Reads the blockchain publication queue stored as fields on simulator_trades
 * documents and pushes each closed trade to Solana mainnet via the Memo program.
 *
 * Queue states processed each run:
 *   1. blockchainStatus == "pending"   → brand-new, publish immediately
 *   2. blockchainStatus == "failed"    → retry if blockchainNextRetryAt <= now
 *   3. blockchainStatus == "processing"→ recover trades stuck > 5 min (cron crash)
 *
 * Each trade gets its own transaction (no batching).
 * Uses finalized commitment — irreversible confirmation before marking confirmed.
 *
 * Explorer links for published trades:
 *   Solscan (primary):  https://solscan.io/tx/<txHash>
 *   Official (alt):     https://explorer.solana.com/tx/<txHash>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  // ── Wallet health check ───────────────────────────────────
  let walletAddress = "unknown";
  let walletBalance = 0;
  try {
    walletAddress = getWalletAddress();
    walletBalance = await getWalletBalance();

    if (walletBalance < MIN_BALANCE_SOL) {
      console.warn(
        `[BlockchainPublish] ⚠️  LOW_BALANCE: ${walletBalance.toFixed(6)} SOL ` +
          `(min ${MIN_BALANCE_SOL} SOL). Fund wallet: ${walletAddress}`
      );
    } else {
      console.log(
        `[BlockchainPublish] Wallet: ${walletAddress} | Balance: ${walletBalance.toFixed(6)} SOL`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BlockchainPublish] Wallet init failed: ${msg}`);
    return NextResponse.json(
      { success: false, error: `Wallet not configured: ${msg}` },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  // Any trade stuck in "processing" for more than 5 minutes is considered crashed
  const stuckCutoff = new Date(Date.now() - 5 * 60_000).toISOString();

  // ── Fetch queue in three passes ───────────────────────────
  // Limits are conservative: finalized commitment takes ~13s per trade.
  // At 3 trades max per pass, worst-case runtime is ~45s — safely within
  // the 120s Cloud Run timeout. Remaining trades are picked up next run.
  const [pendingSnap, failedSnap, stuckSnap] = await Promise.all([
    // 1. Fresh pending trades (queued by sync-simulator)
    db
      .collection("simulator_trades")
      .where("status", "==", "CLOSED")
      .where("blockchainStatus", "==", "pending")
      .limit(3)
      .get(),

    // 2. Failed trades that are ready for their next retry attempt
    db
      .collection("simulator_trades")
      .where("status", "==", "CLOSED")
      .where("blockchainStatus", "==", "failed")
      .where("blockchainNextRetryAt", "<=", now)
      .limit(3)
      .get(),

    // 3. Recover trades stuck in "processing" (cron crashed mid-flight)
    db
      .collection("simulator_trades")
      .where("status", "==", "CLOSED")
      .where("blockchainStatus", "==", "processing")
      .where("blockchainLastAttemptAt", "<=", stuckCutoff)
      .limit(2)
      .get(),
  ]);

  // Merge and deduplicate by document ID
  const seen = new Set<string>();
  const uniqueDocs = [
    ...pendingSnap.docs,
    ...failedSnap.docs,
    ...stuckSnap.docs,
  ].filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });

  if (uniqueDocs.length === 0) {
    return NextResponse.json({
      success: true,
      wallet: walletAddress,
      balanceSol: parseFloat(walletBalance.toFixed(6)),
      processed: 0,
      published: 0,
      failed: 0,
    });
  }

  console.log(
    `[BlockchainPublish] Processing ${uniqueDocs.length} trade(s) ` +
      `(pending=${pendingSnap.size} failed=${failedSnap.size} stuck=${stuckSnap.size})`
  );

  // ── Publish each trade sequentially ──────────────────────
  // Sequential (not parallel) so we don't slam the RPC or run into nonce issues
  let published = 0;
  let failed = 0;

  for (const doc of uniqueDocs) {
    try {
      await publishTrade(db, doc);
      published++;
    } catch (err) {
      failed++;
      console.error(
        `[BlockchainPublish] Unexpected error for trade ${doc.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── Recovery: CLOSED trades missing blockchainStatus altogether ──
  // Handles trades closed before this feature was deployed.
  // Runs opportunistically — won't block the response or cause failures.
  try {
    const untaggedSnap = await db
      .collection("simulator_trades")
      .where("status", "==", "CLOSED")
      .where("blockchainStatus", "==", null as unknown as string)
      .limit(5)
      .get();

    for (const doc of untaggedSnap.docs) {
      await doc.ref.update({
        blockchainStatus: "pending",
        blockchainQueuedAt: new Date().toISOString(),
        blockchainRetryCount: 0,
        blockchainNextRetryAt: null,
        blockchainLastAttemptAt: null,
        blockchainConfirmedAt: null,
        blockchainError: null,
        txHash: null,
      });
    }

    if (!untaggedSnap.empty) {
      console.log(
        `[BlockchainPublish] Recovered ${untaggedSnap.size} untagged closed trade(s) → pending`
      );
    }
  } catch {
    // Non-critical recovery pass — ignore errors
  }

  return NextResponse.json({
    success: true,
    wallet: walletAddress,
    balanceSol: parseFloat(walletBalance.toFixed(6)),
    processed: uniqueDocs.length,
    published,
    failed,
  });
}

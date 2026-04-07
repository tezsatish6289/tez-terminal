import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getWalletAddress, getWalletBalance, MIN_BALANCE_SOL } from "@/lib/solana-wallet";

export const dynamic = "force-dynamic";

/**
 * GET /api/blockchain/wallet
 * Returns wallet address, SOL balance, and Firestore-based publishing stats.
 * Used by the admin blockchain dashboard.
 */
export async function GET() {
  try {
    const db = getAdminFirestore();

    const [address, balance] = await Promise.all([
      Promise.resolve(getWalletAddress()),
      getWalletBalance(),
    ]);

    // Query blockchain stats — counts use single-field queries (no index needed)
    // Recent trades query uses composite index (blockchainStatus + blockchainConfirmedAt)
    const [confirmedSnap, pendingSnap, failedSnap] = await Promise.all([
      db.collection("simulator_trades").where("blockchainStatus", "==", "confirmed").count().get(),
      db.collection("simulator_trades").where("blockchainStatus", "==", "pending").count().get(),
      db.collection("simulator_trades").where("blockchainStatus", "==", "failed").count().get(),
    ]);

    // Recent trades query may fail if the composite index is still building
    let recentTrades: object[] = [];
    try {
      const recentSnap = await db.collection("simulator_trades")
        .where("blockchainStatus", "==", "confirmed")
        .orderBy("blockchainConfirmedAt", "desc")
        .limit(10)
        .get();

      recentTrades = recentSnap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          symbol: d.symbol,
          side: d.side,
          assetType: d.assetType,
          realizedPnl: d.realizedPnl,
          txHash: d.txHash,
          blockchainConfirmedAt: d.blockchainConfirmedAt,
          closedAt: d.closedAt,
        };
      });
    } catch {
      // Index still building — stats still show, recent trades will populate once ready
    }

    return NextResponse.json({
      success: true,
      wallet: {
        address,
        balanceSol: parseFloat(balance.toFixed(6)),
        minBalanceSol: MIN_BALANCE_SOL,
        isLow: balance < MIN_BALANCE_SOL,
        solscanUrl: `https://solscan.io/account/${address}`,
        depositInstruction: `Send SOL to: ${address}`,
      },
      stats: {
        confirmed: confirmedSnap.data().count,
        pending: pendingSnap.data().count,
        failed: failedSnap.data().count,
      },
      recentTrades,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

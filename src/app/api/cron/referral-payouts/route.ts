import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { fetchReferralConfig } from "@/lib/referral";
import { createMassPayout, type PayoutWithdrawal } from "@/lib/nowpayments";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/referral-payouts?key=...
 * Weekly cron job: batches pending referral commissions per referrer
 * and sends payouts via NOWPayments Mass Payout API (TRC-20 USDT).
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const results: Array<{ referrerId: string; status: string; amount?: number; error?: string }> = [];

  try {
    const config = await fetchReferralConfig();
    if (!config.enabled) {
      return NextResponse.json({ message: "Referral system disabled", results: [] });
    }

    // Fetch all pending commissions
    const pendingSnap = await db
      .collection("referral_commissions")
      .where("status", "==", "pending")
      .get();

    if (pendingSnap.empty) {
      return NextResponse.json({ message: "No pending commissions", results: [] });
    }

    // Group commissions by referrerId
    const grouped = new Map<string, Array<{ id: string; amount: number }>>();
    for (const doc of pendingSnap.docs) {
      const data = doc.data();
      const referrerId = data.referrerId;
      if (!grouped.has(referrerId)) grouped.set(referrerId, []);
      grouped.get(referrerId)!.push({
        id: doc.id,
        amount: data.commissionAmountUsd,
      });
    }

    // Process each referrer
    for (const [referrerId, commissions] of grouped) {
      try {
        const totalAmount = Math.round(
          commissions.reduce((sum, c) => sum + c.amount, 0) * 100
        ) / 100;

        // Check minimum payout
        if (config.minPayoutUsd > 0 && totalAmount < config.minPayoutUsd) {
          results.push({
            referrerId,
            status: "skipped",
            amount: totalAmount,
            error: `Below minimum payout threshold ($${config.minPayoutUsd})`,
          });
          continue;
        }

        // Get referrer's wallet address
        const userDoc = await db.collection("users").doc(referrerId).get();
        const walletAddress = userDoc.exists
          ? userDoc.data()?.referralWalletAddress
          : null;

        if (!walletAddress) {
          results.push({
            referrerId,
            status: "skipped",
            amount: totalAmount,
            error: "No wallet address set",
          });
          continue;
        }

        const commissionIds = commissions.map((c) => c.id);
        const now = new Date().toISOString();

        // Create payout record first
        const payoutRef = await db.collection("referral_payouts").add({
          referrerId,
          totalAmountUsd: totalAmount,
          walletAddress,
          network: config.payoutNetwork,
          status: "processing",
          nowpaymentsPayoutId: null,
          commissionIds,
          createdAt: now,
          completedAt: null,
          errorMessage: null,
        });

        // Mark commissions as processing
        const batch = db.batch();
        for (const c of commissions) {
          batch.update(db.collection("referral_commissions").doc(c.id), {
            payoutBatchId: payoutRef.id,
          });
        }
        await batch.commit();

        // Call NOWPayments Mass Payout
        const currency = `usdt${config.payoutNetwork}`;
        const withdrawals: PayoutWithdrawal[] = [
          {
            address: walletAddress,
            currency,
            amount: totalAmount,
          },
        ];

        const host = request.headers.get("host") || "tezterminal.com";
        const protocol = host.includes("localhost") ? "http" : "https";

        const payoutResponse = await createMassPayout({
          ipn_callback_url: `${protocol}://${host}/api/subscription/webhook`,
          withdrawals,
        });

        // Update payout record with NOWPayments response
        await payoutRef.update({
          nowpaymentsPayoutId: payoutResponse.id,
          status: "completed",
          completedAt: new Date().toISOString(),
        });

        // Mark commissions as paid
        const paidBatch = db.batch();
        for (const c of commissions) {
          paidBatch.update(db.collection("referral_commissions").doc(c.id), {
            status: "paid",
            paidAt: new Date().toISOString(),
          });
        }
        await paidBatch.commit();

        results.push({ referrerId, status: "paid", amount: totalAmount });
      } catch (err: any) {
        console.error(`[Referral Payout] Failed for ${referrerId}:`, err.message);

        // Attempt to log the error on the payout doc
        try {
          const failedPayouts = await db
            .collection("referral_payouts")
            .where("referrerId", "==", referrerId)
            .where("status", "==", "processing")
            .limit(1)
            .get();

          if (!failedPayouts.empty) {
            await failedPayouts.docs[0].ref.update({
              status: "failed",
              errorMessage: err.message,
            });
          }
        } catch {}

        results.push({
          referrerId,
          status: "failed",
          error: err.message,
        });
      }
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Referral payouts processed: ${results.length} referrers`,
      details: JSON.stringify(results),
      webhookId: "REFERRAL_PAYOUTS_CRON",
    });

    return NextResponse.json({ message: "Payouts processed", results });
  } catch (error: any) {
    console.error("[Referral Payouts Cron]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

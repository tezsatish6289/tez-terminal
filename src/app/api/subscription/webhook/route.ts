import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getIpnSecret } from "@/lib/nowpayments";
import { computeNewEndDate, type SubscriptionDoc } from "@/lib/subscription";
import { fetchReferralConfig, type ReferralCommissionDoc } from "@/lib/referral";
import { sendMessage } from "@/lib/telegram";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function sortObject(obj: Record<string, any>): Record<string, any> {
  return Object.keys(obj)
    .sort()
    .reduce((result: Record<string, any>, key) => {
      result[key] =
        obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])
          ? sortObject(obj[key])
          : obj[key];
      return result;
    }, {});
}

function verifySignature(payload: Record<string, any>, signature: string): boolean {
  try {
    const ipnSecret = getIpnSecret();
    const sorted = sortObject(payload);
    const hmac = crypto
      .createHmac("sha512", ipnSecret)
      .update(JSON.stringify(sorted))
      .digest("hex");
    return hmac === signature;
  } catch {
    return false;
  }
}

/**
 * POST /api/subscription/webhook
 * NOWPayments IPN callback. Verifies HMAC signature, updates payment
 * and subscription records, sends Telegram notifications.
 */
export async function POST(request: NextRequest) {
  const db = getAdminFirestore();

  try {
    const signature = request.headers.get("x-nowpayments-sig");
    const body = await request.json();

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `NOWPayments IPN received: payment_id=${body.payment_id} status=${body.payment_status}`,
      details: JSON.stringify(body),
      webhookId: "NOWPAYMENTS_IPN",
    });

    if (!signature || !verifySignature(body, signature)) {
      console.error("[IPN Webhook] Invalid signature");
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: "NOWPayments IPN signature verification failed",
        webhookId: "NOWPAYMENTS_IPN",
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const paymentId = String(body.payment_id);
    const paymentStatus = body.payment_status;

    const paymentRef = db.collection("payments").doc(paymentId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      console.error(`[IPN Webhook] Payment ${paymentId} not found`);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const paymentData = paymentSnap.data()!;
    const now = new Date().toISOString();

    await paymentRef.update({
      status: paymentStatus,
      updatedAt: now,
    });

    const userId = paymentData.userId;
    const days = paymentData.days;

    const userSnap = await db.collection("users").doc(userId).get();
    const chatId = userSnap.exists ? userSnap.data()?.telegramChatId : null;

    if (paymentStatus === "confirming" || paymentStatus === "confirmed") {
      if (chatId) {
        await sendMessage(
          chatId,
          `⏳ <b>Payment detected!</b>\n\nYour payment for a ${days}-day subscription has been detected on the blockchain. Waiting for confirmations...\n\nThis usually takes 2-5 minutes.`
        ).catch(() => {});
      }
    }

    if (paymentStatus === "sending" || paymentStatus === "finished") {
      const subRef = db.collection("subscriptions").doc(userId);
      const subSnap = await subRef.get();

      if (subSnap.exists) {
        const subData = subSnap.data() as SubscriptionDoc;
        const newEndDate = computeNewEndDate(subData.subscriptionEndDate, days);

        await subRef.update({
          status: "active",
          subscriptionEndDate: newEndDate,
        });

        if (chatId && paymentStatus === "finished") {
          const endFormatted = new Date(newEndDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          await sendMessage(
            chatId,
            `🎉 <b>Payment confirmed!</b>\n\n✅ ${days} days added to your subscription\n📅 Active until: <b>${endFormatted}</b>\n\nEnjoy AI-powered trade signals!`,
            {
              replyMarkup: {
                inline_keyboard: [
                  [{ text: "🚀 View Signals", url: "https://tezterminal.com" }],
                ],
              },
            }
          ).catch(() => {});
        }
      }
    }

    // Create referral commission when payment is confirmed
    if (paymentStatus === "finished") {
      try {
        const referredUserDoc = await db.collection("users").doc(userId).get();
        const referredBy = referredUserDoc.exists ? referredUserDoc.data()?.referredBy : null;

        if (referredBy) {
          const existingCommission = await db
            .collection("referral_commissions")
            .where("paymentId", "==", paymentId)
            .limit(1)
            .get();

          if (existingCommission.empty) {
            const config = await fetchReferralConfig();
            if (config.enabled) {
              const purchaseAmountUsd = paymentData.priceAmountUsd || 0;
              const commissionDoc: ReferralCommissionDoc = {
                referrerId: referredBy,
                referredUserId: userId,
                paymentId,
                purchaseAmountUsd,
                commissionRate: config.commissionRate,
                commissionAmountUsd: Math.round(purchaseAmountUsd * config.commissionRate * 100) / 100,
                status: "pending",
                payoutBatchId: null,
                createdAt: now,
                paidAt: null,
              };
              await db.collection("referral_commissions").add(commissionDoc);
            }
          }
        }
      } catch (refErr: any) {
        console.error("[IPN Webhook] Referral commission error:", refErr.message);
      }
    }

    if (paymentStatus === "failed" || paymentStatus === "expired") {
      if (chatId) {
        await sendMessage(
          chatId,
          `❌ <b>Payment ${paymentStatus}</b>\n\nYour payment for a ${days}-day subscription was ${paymentStatus}. You can try again by visiting the subscribe page.`,
          {
            replyMarkup: {
              inline_keyboard: [
                [{ text: "🔄 Try Again", url: "https://tezterminal.com/subscribe" }],
              ],
            },
          }
        ).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[IPN Webhook]", error.message);
    try {
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: `NOWPayments IPN error: ${error.message}`,
        details: error.stack || "",
        webhookId: "NOWPAYMENTS_IPN",
      });
    } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

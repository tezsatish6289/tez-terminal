import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  MIN_SUBSCRIPTION_DAYS,
  calculatePrice,
  generateOrderId,
  type PaymentDoc,
} from "@/lib/subscription";
import { createPayment } from "@/lib/nowpayments";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscription/create-payment
 * Creates a NOWPayments payment and stores the record in Firestore.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, days, payCurrency } = body;

    if (!uid || !days || !payCurrency) {
      return NextResponse.json(
        { error: "Missing required fields: uid, days, payCurrency" },
        { status: 400 }
      );
    }

    if (typeof days !== "number" || days < MIN_SUBSCRIPTION_DAYS) {
      return NextResponse.json(
        { error: `Minimum subscription is ${MIN_SUBSCRIPTION_DAYS} days` },
        { status: 400 }
      );
    }

    if (typeof payCurrency !== "string" || payCurrency.length < 2) {
      return NextResponse.json(
        { error: `Invalid currency: ${payCurrency}` },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();

    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;
    if (!userData?.telegramChatId) {
      return NextResponse.json(
        { error: "Please connect your Telegram account before subscribing" },
        { status: 400 }
      );
    }

    const priceAmount = calculatePrice(days);
    const orderId = generateOrderId(uid);

    const host = request.headers.get("host") || "tezterminal.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    const ipnCallbackUrl = `${protocol}://${host}/api/subscription/webhook`;

    const paymentResponse = await createPayment({
      price_amount: priceAmount,
      price_currency: "usd",
      pay_currency: payCurrency,
      order_id: orderId,
      order_description: `TezTerminal ${days}-day subscription`,
      ipn_callback_url: ipnCallbackUrl,
    });

    const now = new Date().toISOString();
    const paymentDoc: PaymentDoc = {
      userId: uid,
      orderId,
      nowPaymentId: paymentResponse.payment_id,
      days,
      priceAmountUsd: priceAmount,
      payCurrency,
      payAmount: paymentResponse.pay_amount,
      payAddress: paymentResponse.pay_address,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection("payments")
      .doc(String(paymentResponse.payment_id))
      .set(paymentDoc);

    return NextResponse.json({
      success: true,
      paymentId: paymentResponse.payment_id,
      payAddress: paymentResponse.pay_address,
      payAmount: paymentResponse.pay_amount,
      payCurrency,
      priceAmountUsd: priceAmount,
      orderId,
      expirationEstimate: paymentResponse.expiration_estimate_date,
    });
  } catch (error: any) {
    console.error("[Create Payment]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

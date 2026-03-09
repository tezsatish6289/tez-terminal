
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Webhook ingestion for external sentiment indicator data.
 * Receives smoothed sentiment scores and stores them in Firestore.
 * Auth via static secretKey (same pattern as the signal webhook).
 */
export async function POST(request: NextRequest) {
  const db = getAdminFirestore();
  const timestamp = new Date().toISOString();
  let webhookId = "UNKNOWN";
  let rawBody = "";

  try {
    const { searchParams } = new URL(request.url);
    webhookId = searchParams.get("id") || "MISSING_ID";

    try {
      rawBody = await request.text();
    } catch {
      rawBody = "UNREADABLE_BODY";
    }

    if (webhookId === "MISSING_ID") {
      throw new Error("Missing 'id' parameter in Sentiment Webhook URL.");
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.trim());
    } catch {
      throw new Error("Invalid JSON: Ensure the sender is posting valid JSON content.");
    }

    const configSnap = await db.collection("webhooks").doc(webhookId).get();
    if (!configSnap.exists) {
      throw new Error(`Sentiment Bridge ID '${webhookId}' not found.`);
    }

    const configData = configSnap.data()!;
    if (configData.type !== "sentiment") {
      throw new Error(`Bridge '${configData.name}' is not a sentiment webhook.`);
    }

    const providedKey = body.secretKey || searchParams.get("key");
    if (configData.secretKey && providedKey !== configData.secretKey) {
      throw new Error(`Auth Failure: Secret key mismatch for bridge '${configData.name}'.`);
    }

    const sentiment = String(body.sentiment ?? "neutral").toLowerCase();
    if (!["bullish", "bearish", "neutral"].includes(sentiment)) {
      throw new Error(`Invalid sentiment value: '${body.sentiment}'. Must be bullish, bearish, or neutral.`);
    }

    const score = parseFloat(String(body.score ?? 0));
    if (Number.isNaN(score)) {
      throw new Error(`Invalid score: '${body.score}'. Must be a number.`);
    }

    const rawScore = parseFloat(String(body.raw_score ?? 0));
    const timeframe = String(body.timeframe ?? "15").toUpperCase().trim();
    const tfMap: Record<string, string> = {
      "1M": "1", "5M": "5", "15M": "15", "1H": "60", "4H": "240", "D": "D", "1D": "D",
    };
    const normalizedTf = tfMap[timeframe] || timeframe;
    const algo = String(body.algo || "External Sentiment Indicator").trim();

    const sentimentData: Record<string, any> = {
      webhookId,
      receivedAt: timestamp,
      serverTimestamp: FieldValue.serverTimestamp(),
      payload: rawBody,
      sentiment,
      score,
      rawScore: Number.isNaN(rawScore) ? 0 : rawScore,
      timeframe: normalizedTf,
      algo,
      source: configData.name || "Sentiment Webhook",
    };

    await db.collection("sentiment_signals").add(sentimentData);

    return NextResponse.json({
      success: true,
      message: `Sentiment ingested: ${sentiment} (score: ${score}) on ${normalizedTf} timeframe.`,
    });
  } catch (error: any) {
    console.error("[Sentiment Webhook Error]", error.message);
    try {
      await db.collection("logs").add({
        timestamp,
        level: "ERROR",
        message: "Sentiment Ingestion Failure",
        details: `Body: ${rawBody}\nError: ${error.message}`,
        webhookId: webhookId || "UNKNOWN",
      });
    } catch {}
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { encrypt } from "@/lib/crypto";
import { getConnector, getSecretDocId } from "@/lib/exchanges";
import type { ExchangeName } from "@/lib/exchanges";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// ─── HMAC fingerprint (exchange + primary credential) ────────────────────────

function computeFingerprint(
  exchange: string,
  primaryCredential: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${exchange}:${primaryCredential}`)
    .digest("hex");
}

// ─── Validation ──────────────────────────────────────────────────────────────

const ALLOWED_BOTS = new Set(["CRYPTO", "INDIAN_STOCKS", "GOLD", "SILVER"]);
const ALLOWED_EXCHANGES: Record<string, string[]> = {
  CRYPTO:        ["BYBIT"],
  INDIAN_STOCKS: ["ZERODHA", "UPSTOX", "ANGEL_ONE", "DHAN"],
};

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Parse body
    const body = await req.json();
    const { bot, exchange, credentials } = body as {
      bot?: string;
      exchange?: string;
      credentials?: Record<string, string>;
    };

    if (!bot || !exchange || !credentials?.apiKey || !credentials?.apiSecret) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!ALLOWED_BOTS.has(bot)) {
      return NextResponse.json({ error: "Invalid bot" }, { status: 400 });
    }

    const allowedExchanges = ALLOWED_EXCHANGES[bot] ?? [];
    if (!allowedExchanges.includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange for this bot" }, { status: 400 });
    }

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const keyFingerprint = computeFingerprint(exchange, credentials.apiKey, encryptionKey);
    const db = getAdminFirestore();

    // ── Block if this user already has an active deployment on this exchange ────
    const existingActiveSnap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .where("exchange", "==", exchange)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!existingActiveSnap.empty) {
      return NextResponse.json(
        { error: "You already have an active bot on this exchange. Stop it from your dashboard before deploying a new one." },
        { status: 409 },
      );
    }

    // ── Check if a *different* user already owns this exact API key ────────────
    const duplicateSnap = await db
      .collection("bot_deployments")
      .where("exchange", "==", exchange)
      .where("keyFingerprint", "==", keyFingerprint)
      .limit(1)
      .get();

    if (!duplicateSnap.empty && duplicateSnap.docs[0].data().uid !== uid) {
      return NextResponse.json(
        { error: "This API key is already registered on FreedomBot. Each exchange account can only be linked once." },
        { status: 409 },
      );
    }

    // ── Validate API keys by calling the exchange ─────────────────────────────
    try {
      const connector = getConnector(exchange);
      const balance = await connector.getUsdtBalance({
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret,
        testnet: false,
      });
      if (balance.total < 0) throw new Error("Unexpected negative balance");
    } catch (e) {
      return NextResponse.json(
        {
          error: `Could not verify your ${exchange} API keys: ${e instanceof Error ? e.message : String(e)}. Please check they are correct and have futures trading permissions enabled.`,
        },
        { status: 400 },
      );
    }

    // ── Write credentials into the trading engine's secrets collection ─────────
    const docId = getSecretDocId(exchange as ExchangeName);
    await db.collection("users").doc(uid).collection("secrets").doc(docId).set({
      exchange,
      encryptedKey: encrypt(credentials.apiKey),
      encryptedSecret: encrypt(credentials.apiSecret),
      keyLastFour: credentials.apiKey.slice(-4),
      autoTradeEnabled: true,
      riskPerTrade: 0.5,
      maxConcurrentTrades: 1,
      dailyLossLimit: 5,
      useTestnet: false,
      savedAt: new Date().toISOString(),
    });

    // ── Create new deployment record ──────────────────────────────────────────
    const docRef = await db.collection("bot_deployments").add({
      uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      bot,
      exchange,
      keyFingerprint,
      keyLastFour: credentials.apiKey.slice(-4),
      status: "active",
      createdAt: new Date(),
    });
    const deploymentId = docRef.id;

    return NextResponse.json({ success: true, deploymentId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

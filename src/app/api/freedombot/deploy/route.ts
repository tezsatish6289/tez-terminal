import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { encrypt } from "@/lib/crypto";
import { getConnector, getSecretDocId } from "@/lib/exchanges";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// ─── HMAC fingerprint (exchange + primary credential) ────────────────────────
// Deterministic and irreversible — safe to store in plaintext for uniqueness checks.

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
      credentials?: { apiKey: string; apiSecret: string };
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

    // ── Uniqueness check (fingerprint-based) ──────────────────────────────────
    const keyFingerprint = computeFingerprint(exchange, credentials.apiKey, encryptionKey);
    const db = getAdminFirestore();

    const duplicateSnap = await db
      .collection("bot_deployments")
      .where("exchange", "==", exchange)
      .where("keyFingerprint", "==", keyFingerprint)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      const existingUid = duplicateSnap.docs[0].data().uid;
      if (existingUid === uid) {
        return NextResponse.json(
          { error: "You have already connected this API key. Visit your dashboard to manage your bot." },
          { status: 409 },
        );
      }
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
        { error: `Could not verify your ${exchange} API keys: ${e instanceof Error ? e.message : String(e)}. Please check they are correct and have futures trading permissions.` },
        { status: 400 },
      );
    }

    // ── Write credentials to the trading engine's secrets collection ──────────
    // This is the same path the live trading cron reads from: users/{uid}/secrets/{docId}
    const docId = getSecretDocId(exchange as "BYBIT" | "BINANCE" | "MEXC" | "DHAN");
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

    // ── Record deployment for tracking / dashboard ────────────────────────────
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

    return NextResponse.json({ success: true, deploymentId: docRef.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

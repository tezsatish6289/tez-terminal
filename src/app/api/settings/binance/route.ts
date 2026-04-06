import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  getConnector,
  isExchangeSupported,
  getSecretDocId,
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";
import { generateTokenForUser } from "@/lib/dhan-token";

/**
 * Exchange credentials management.
 *
 * Supports multiple exchanges via the `exchange` parameter.
 * Credentials are stored at: users/{uid}/secrets/{docId}
 *   - BYBIT   → secrets/bybit   (fallback: legacy secrets/binance)
 *   - BINANCE → secrets/binance_futures
 *   - MEXC    → secrets/mexc
 *
 * GET    — check if credentials are saved + auto-trade status
 * POST   — save (encrypted) API key + secret
 * PUT    — update auto-trade config (toggle, risk, max trades, etc.)
 * DELETE — remove credentials for an exchange
 */

function resolveExchangeName(param: string | null | undefined): ExchangeName {
  const raw = (param || "BYBIT").toUpperCase();
  if (!isExchangeSupported(raw)) return "BYBIT";
  return raw as ExchangeName;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const exchangeName = resolveExchangeName(searchParams.get("exchange"));
  const db = getAdminFirestore();

  const docIds = getSecretDocIds(exchangeName);
  let data: Record<string, unknown> | null = null;

  for (const id of docIds) {
    const doc = await db.collection("users").doc(uid).collection("secrets").doc(id).get();
    if (doc.exists) {
      const docData = doc.data()!;
      if (docMatchesExchange(docData, exchangeName)) {
        data = docData;
        break;
      }
    }
  }

  if (!data) {
    return NextResponse.json({ configured: false, autoTradeEnabled: false, exchange: exchangeName });
  }

  return NextResponse.json({
    configured: true,
    exchange: exchangeName,
    autoTradeEnabled: data.autoTradeEnabled ?? false,
    keyLastFour: data.keyLastFour ?? "****",
    riskPerTrade: data.riskPerTrade ?? 0.5,
    maxConcurrentTrades: data.maxConcurrentTrades ?? 5,
    dailyLossLimit: data.dailyLossLimit ?? 3,
    useTestnet: data.useTestnet ?? true,
    savedAt: data.savedAt ?? null,
    // Dhan-specific: indicate TOTP is configured (without exposing secrets)
    totpConfigured: exchangeName === "DHAN" ? !!(data.encryptedSecret && data.encryptedPin) : undefined,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, apiKey, apiSecret } = body;

    if (!uid || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing uid, apiKey, or apiSecret" }, { status: 400 });
    }

    const exchangeName = resolveExchangeName(body.exchange);
    const useTestnet = body.useTestnet === true;
    const docId = getSecretDocId(exchangeName);
    const db = getAdminFirestore();

    if (exchangeName === "DHAN") {
      // Dhan: apiKey = Client ID, apiSecret = TOTP secret, body.pin = login PIN
      const pin = body.pin as string | undefined;
      if (!pin) {
        return NextResponse.json({ error: "Missing Dhan login PIN" }, { status: 400 });
      }

      // Validate by generating a real token — confirms all 3 credentials are correct
      const testToken = await generateTokenForUser(apiKey, apiSecret, pin);
      if (!testToken) {
        return NextResponse.json({
          error: "Invalid Dhan credentials. Check your Client ID, TOTP Secret, and PIN.",
        }, { status: 400 });
      }

      await db.collection("users").doc(uid).collection("secrets").doc(docId).set({
        exchange: "DHAN",
        encryptedKey: encrypt(apiKey),       // Client ID
        encryptedSecret: encrypt(apiSecret), // TOTP secret
        encryptedPin: encrypt(pin),          // Login PIN
        encryptedCachedToken: encrypt(testToken),
        cachedTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        keyLastFour: apiKey.slice(-4),
        autoTradeEnabled: false,
        riskPerTrade: 0.5,
        maxConcurrentTrades: 1,
        dailyLossLimit: 5,
        useTestnet: false,
        savedAt: new Date().toISOString(),
      });

      return NextResponse.json({ success: true, message: "Dhan credentials verified and saved. Token auto-renews daily." });
    }

    // ── Crypto exchanges: validate via balance check ──────────────
    try {
      const connector = getConnector(exchangeName);
      const balance = await connector.getUsdtBalance({ apiKey, apiSecret, testnet: useTestnet });
      if (balance.total < 0) throw new Error("Unexpected negative balance");
    } catch (e) {
      return NextResponse.json({
        error: `Invalid ${exchangeName} credentials for ${useTestnet ? "testnet" : "production"}: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 400 });
    }

    await db.collection("users").doc(uid).collection("secrets").doc(docId).set({
      exchange: exchangeName,
      encryptedKey: encrypt(apiKey),
      encryptedSecret: encrypt(apiSecret),
      keyLastFour: apiKey.slice(-4),
      autoTradeEnabled: false,
      riskPerTrade: 0.5,
      maxConcurrentTrades: 1,
      dailyLossLimit: 5,
      useTestnet,
      savedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: `${exchangeName} credentials saved and validated.` });
  } catch (e) {
    console.error("[settings/exchange POST]", e);
    return NextResponse.json({
      error: `Server error: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { uid, ...updates } = body;

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const exchangeName = resolveExchangeName(body.exchange);
  const allowed = ["autoTradeEnabled", "riskPerTrade", "maxConcurrentTrades", "dailyLossLimit", "useTestnet"];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const docIds = getSecretDocIds(exchangeName);
  let ref: FirebaseFirestore.DocumentReference | null = null;

  for (const id of docIds) {
    const docRef = db.collection("users").doc(uid).collection("secrets").doc(id);
    const doc = await docRef.get();
    if (doc.exists && docMatchesExchange(doc.data()!, exchangeName)) {
      ref = docRef;
      break;
    }
  }

  if (!ref) {
    return NextResponse.json({ error: `${exchangeName} credentials not configured yet` }, { status: 400 });
  }

  await ref.update(filtered);
  return NextResponse.json({ success: true, exchange: exchangeName, updated: Object.keys(filtered) });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const exchangeName = resolveExchangeName(searchParams.get("exchange"));
  const db = getAdminFirestore();
  const docIds = getSecretDocIds(exchangeName);

  let deleted = false;
  for (const id of docIds) {
    const docRef = db.collection("users").doc(uid).collection("secrets").doc(id);
    const doc = await docRef.get();
    if (doc.exists && docMatchesExchange(doc.data()!, exchangeName)) {
      await docRef.delete();
      deleted = true;
      break;
    }
  }

  if (!deleted) {
    return NextResponse.json({ error: `No ${exchangeName} credentials found` }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: `${exchangeName} credentials deleted.` });
}

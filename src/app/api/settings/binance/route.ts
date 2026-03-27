import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getConnector, isExchangeSupported, type ExchangeName } from "@/lib/exchanges";

/**
 * Exchange credentials management.
 *
 * Supports multiple exchanges via the `exchange` parameter.
 * Backward compatible: defaults to "BYBIT" when no exchange is specified.
 * Credentials are stored at: users/{uid}/secrets/{exchange_lowercase}
 *
 * GET  — check if credentials are saved + auto-trade status
 * POST — save (encrypted) API key + secret
 * PUT  — update auto-trade config (toggle, risk, max trades, etc.)
 */

function resolveExchange(param: string | null): { name: ExchangeName; docId: string } {
  const raw = (param || "BYBIT").toUpperCase();
  // Backward compat: treat "BINANCE" param as Bybit when it's the legacy doc
  if (!isExchangeSupported(raw)) {
    return { name: "BYBIT", docId: "binance" };
  }
  return { name: raw as ExchangeName, docId: raw.toLowerCase() };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const { name: exchangeName, docId } = resolveExchange(searchParams.get("exchange"));

  const db = getAdminFirestore();

  // Check the exchange-specific doc, falling back to legacy "binance" doc for Bybit
  let doc = await db.collection("users").doc(uid).collection("secrets").doc(docId).get();
  if (!doc.exists && exchangeName === "BYBIT" && docId !== "binance") {
    doc = await db.collection("users").doc(uid).collection("secrets").doc("binance").get();
  }

  if (!doc.exists) {
    return NextResponse.json({ configured: false, autoTradeEnabled: false, exchange: exchangeName });
  }

  const data = doc.data()!;
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
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, apiKey, apiSecret } = body;

    if (!uid || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing uid, apiKey, or apiSecret" }, { status: 400 });
    }

    const { name: exchangeName, docId } = resolveExchange(body.exchange);
    const useTestnet = body.useTestnet === true;

    // Validate credentials by attempting a balance check on the target exchange
    try {
      const connector = getConnector(exchangeName);
      const balance = await connector.getUsdtBalance({ apiKey, apiSecret, testnet: useTestnet });
      if (balance.total < 0) throw new Error("Unexpected negative balance");
    } catch (e) {
      return NextResponse.json({
        error: `Invalid ${exchangeName} credentials for ${useTestnet ? "testnet" : "production"}: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 400 });
    }

    const db = getAdminFirestore();
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

  const { name: exchangeName, docId } = resolveExchange(body.exchange);

  const allowed = ["autoTradeEnabled", "riskPerTrade", "maxConcurrentTrades", "dailyLossLimit", "useTestnet"];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getAdminFirestore();

  // Check exchange-specific doc, fall back to legacy "binance" doc
  let ref = db.collection("users").doc(uid).collection("secrets").doc(docId);
  let doc = await ref.get();
  if (!doc.exists && exchangeName === "BYBIT" && docId !== "binance") {
    ref = db.collection("users").doc(uid).collection("secrets").doc("binance");
    doc = await ref.get();
  }

  if (!doc.exists) {
    return NextResponse.json({ error: `${exchangeName} credentials not configured yet` }, { status: 400 });
  }

  await ref.update(filtered);
  return NextResponse.json({ success: true, exchange: exchangeName, updated: Object.keys(filtered) });
}

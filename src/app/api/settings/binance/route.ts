import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getUsdtBalance } from "@/lib/binance";

/**
 * GET  — check if credentials are saved + auto-trade status
 * POST — save (encrypted) Binance API key + secret
 * PUT  — update auto-trade config (toggle, risk, max trades, etc.)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const db = getAdminFirestore();
  const doc = await db.collection("users").doc(uid).collection("secrets").doc("binance").get();

  if (!doc.exists) {
    return NextResponse.json({ configured: false, autoTradeEnabled: false });
  }

  const data = doc.data()!;
  return NextResponse.json({
    configured: true,
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
  const body = await request.json();
  const { uid, apiKey, apiSecret } = body;

  if (!uid || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Missing uid, apiKey, or apiSecret" }, { status: 400 });
  }

  // Validate the credentials by attempting a balance check
  try {
    const balance = await getUsdtBalance({ apiKey, apiSecret });
    if (balance.total < 0) throw new Error("Unexpected negative balance");
  } catch (e) {
    return NextResponse.json({
      error: `Invalid Binance credentials: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 400 });
  }

  const db = getAdminFirestore();
  await db.collection("users").doc(uid).collection("secrets").doc("binance").set({
    encryptedKey: encrypt(apiKey),
    encryptedSecret: encrypt(apiSecret),
    keyLastFour: apiKey.slice(-4),
    autoTradeEnabled: false,
    riskPerTrade: 0.5,
    maxConcurrentTrades: 1,
    dailyLossLimit: 5,
    useTestnet: true,
    savedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, message: "Binance credentials saved and validated." });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { uid, ...updates } = body;

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const allowed = ["autoTradeEnabled", "riskPerTrade", "maxConcurrentTrades", "dailyLossLimit", "useTestnet"];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid).collection("secrets").doc("binance");
  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: "Binance credentials not configured yet" }, { status: 400 });
  }

  await ref.update(filtered);
  return NextResponse.json({ success: true, updated: Object.keys(filtered) });
}

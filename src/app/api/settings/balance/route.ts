import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";
import { getConnector, isExchangeSupported, type ExchangeName } from "@/lib/exchanges";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const exchangeParam = (searchParams.get("exchange") || "BYBIT").toUpperCase();
    const exchangeName = isExchangeSupported(exchangeParam) ? exchangeParam as ExchangeName : "BYBIT";
    const docId = exchangeName.toLowerCase();

    const db = getAdminFirestore();

    // Try exchange-specific doc, fall back to legacy "binance" doc for Bybit
    let doc = await db.collection("users").doc(uid).collection("secrets").doc(docId).get();
    if (!doc.exists && exchangeName === "BYBIT") {
      doc = await db.collection("users").doc(uid).collection("secrets").doc("binance").get();
    }

    if (!doc.exists) {
      return NextResponse.json({ error: "Not configured" }, { status: 400 });
    }

    const data = doc.data()!;
    const creds = {
      apiKey: decrypt(data.encryptedKey),
      apiSecret: decrypt(data.encryptedSecret),
      testnet: data.useTestnet === true,
    };

    const connector = getConnector(exchangeName);
    const balance = await connector.getUsdtBalance(creds);

    return NextResponse.json({
      exchange: exchangeName,
      total: balance.total,
      available: balance.available,
      testnet: data.useTestnet === true,
    });
  } catch (e) {
    return NextResponse.json({
      error: `Failed to fetch balance: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }
}

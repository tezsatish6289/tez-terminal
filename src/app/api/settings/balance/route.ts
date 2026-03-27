import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";
import {
  getConnector,
  isExchangeSupported,
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const exchangeParam = (searchParams.get("exchange") || "BYBIT").toUpperCase();
    const exchangeName = isExchangeSupported(exchangeParam) ? exchangeParam as ExchangeName : "BYBIT";

    const db = getAdminFirestore();
    const docIds = getSecretDocIds(exchangeName);

    let data: Record<string, unknown> | null = null;
    for (const id of docIds) {
      const doc = await db.collection("users").doc(uid).collection("secrets").doc(id).get();
      if (doc.exists && docMatchesExchange(doc.data()!, exchangeName)) {
        data = doc.data()!;
        break;
      }
    }

    if (!data) {
      return NextResponse.json({ error: "Not configured" }, { status: 400 });
    }

    const creds = {
      apiKey: decrypt(data.encryptedKey as string),
      apiSecret: decrypt(data.encryptedSecret as string),
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

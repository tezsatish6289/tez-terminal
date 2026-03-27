import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";
import { protectiveClose, type LiveTrade, type Credentials } from "@/lib/trade-engine";
import { sendMessage } from "@/lib/telegram";
import {
  type ExchangeName,
  SUPPORTED_EXCHANGES,
  isExchangeSupported,
  getSecretDocIds,
  docMatchesExchange,
} from "@/lib/exchanges";

/**
 * POST — Emergency kill switch: close all open live trades across all exchanges
 * (or a specific exchange), disable auto-trade, alert via Telegram.
 *
 * Supports optional `exchange` param to target a specific exchange.
 * Without it, kills ALL exchanges for the user.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { uid } = body;

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const targetExchange = body.exchange
    ? (isExchangeSupported(body.exchange) ? body.exchange.toUpperCase() as ExchangeName : null)
    : null; // null = kill all exchanges

  const db = getAdminFirestore();

  const results: Array<{ symbol: string; exchange: string; success: boolean; error?: string }> = [];
  const exchangesToKill = targetExchange ? [targetExchange] : SUPPORTED_EXCHANGES;

  for (const exchangeName of exchangesToKill) {
    const docIds = getSecretDocIds(exchangeName);

    let secretDoc = null;
    let secretDocRef = null;

    for (const id of docIds) {
      const ref = db.collection("users").doc(uid).collection("secrets").doc(id);
      const doc = await ref.get();
      if (doc.exists && docMatchesExchange(doc.data()!, exchangeName)) {
        secretDoc = doc;
        secretDocRef = ref;
        break;
      }
    }

    if (!secretDoc || !secretDocRef) continue;

    const atData = secretDoc.data()!;

    // Disable auto-trade immediately
    await secretDocRef.update({ autoTradeEnabled: false });

    const creds: Credentials = {
      apiKey: decrypt(atData.encryptedKey),
      apiSecret: decrypt(atData.encryptedSecret),
      testnet: atData.useTestnet === true,
    };

    // Close all open trades for this user on this exchange
    const openSnap = await db.collection("live_trades")
      .where("status", "==", "OPEN")
      .where("userId", "==", uid)
      .where("exchange", "==", exchangeName)
      .get();

    for (const d of openSnap.docs) {
      const trade = { id: d.id, ...d.data() } as LiveTrade;
      try {
        const closeResult = await protectiveClose(trade, "KILL_SWITCH", trade.entryPrice, creds);
        await db.collection("live_trades").doc(d.id).update({
          ...closeResult.updatedFields,
          events: [...(trade.events || []), closeResult.newEvent],
        });
        results.push({ symbol: trade.signalSymbol, exchange: exchangeName, success: true });

        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "KILL_SWITCH",
          details: `${trade.signalSymbol} ${trade.side} emergency closed on ${exchangeName}${closeResult.warning ? ` (${closeResult.warning})` : ""}`,
          symbol: trade.signalSymbol,
          userId: uid,
          exchange: exchangeName,
        });
      } catch (e) {
        results.push({
          symbol: trade.signalSymbol,
          exchange: exchangeName,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Telegram alerts
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const chatId = userDoc.data()?.telegramChatId;
    if (chatId) {
      const closed = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);
      const exchanges = [...new Set(results.map((r) => r.exchange))].join(", ") || "none";
      const symbols = results.map((r) => r.symbol).join(", ") || "none";

      await sendMessage(chatId,
        `🚨 <b>KILL SWITCH ACTIVATED</b> 🚨\n\n` +
        `⛔ Auto-trade has been <b>DISABLED</b>.\n` +
        `Exchanges: <b>${exchanges}</b>\n` +
        `Positions closed: <b>${closed}/${results.length}</b>\n` +
        `Symbols: ${symbols}\n\n` +
        (failed.length ? `⚠️ Failed to close: ${failed.map((f) => `${f.symbol}@${f.exchange} (${f.error})`).join(", ")}\n\n` : "") +
        `Re-enable manually from Settings when ready.`
      );
      await new Promise((r) => setTimeout(r, 2000));
      await sendMessage(chatId, `🚨 REMINDER: Kill switch triggered. ${closed} positions closed. Auto-trade is OFF.`);
      await new Promise((r) => setTimeout(r, 2000));
      await sendMessage(chatId, `⛔ Auto-trade is DISABLED. Review your positions and re-enable from Settings.`);
    }
  } catch (tgErr) {
    console.error("[KillSwitch] Telegram alert failed:", tgErr);
  }

  return NextResponse.json({
    success: true,
    message: `Kill switch activated. Auto-trade disabled. ${results.filter((r) => r.success).length}/${results.length} positions closed.`,
    results,
  });
}

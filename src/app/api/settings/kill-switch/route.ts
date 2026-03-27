import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";
import { protectiveClose, type LiveTrade, type Credentials } from "@/lib/trade-engine";
import { sendMessage } from "@/lib/telegram";

/**
 * POST — Emergency kill switch: close all open live trades, disable auto-trade, alert via Telegram.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { uid } = body;

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const db = getAdminFirestore();

  const secretDoc = await db.collection("users").doc(uid).collection("secrets").doc("binance").get();
  if (!secretDoc.exists) {
    return NextResponse.json({ error: "No Bybit credentials configured" }, { status: 400 });
  }

  const atData = secretDoc.data()!;

  // Disable auto-trade immediately
  await db.collection("users").doc(uid).collection("secrets").doc("binance").update({
    autoTradeEnabled: false,
  });

  const creds: Credentials = {
    apiKey: decrypt(atData.encryptedKey),
    apiSecret: decrypt(atData.encryptedSecret),
  };

  const openSnap = await db.collection("live_trades")
    .where("status", "==", "OPEN")
    .where("userId", "==", uid)
    .get();

  const results: Array<{ symbol: string; success: boolean; error?: string }> = [];

  for (const d of openSnap.docs) {
    const trade = { id: d.id, ...d.data() } as LiveTrade;
    try {
      const closeResult = await protectiveClose(trade, "KILL_SWITCH", trade.entryPrice, creds);
      await db.collection("live_trades").doc(d.id).update({
        ...closeResult.updatedFields,
        events: [...(trade.events || []), closeResult.newEvent],
      });
      results.push({ symbol: trade.signalSymbol, success: true });

      await db.collection("simulator_logs").add({
        timestamp: new Date().toISOString(),
        action: "KILL_SWITCH",
        details: `${trade.signalSymbol} ${trade.side} emergency closed${closeResult.warning ? ` (${closeResult.warning})` : ""}`,
        symbol: trade.signalSymbol,
      });
    } catch (e) {
      results.push({
        symbol: trade.signalSymbol,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Send Telegram alerts (3 messages for urgency)
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const chatId = userDoc.data()?.telegramChatId;
    if (chatId) {
      const closed = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);
      const symbols = results.map((r) => r.symbol).join(", ");

      await sendMessage(chatId,
        `🚨 <b>KILL SWITCH ACTIVATED</b> 🚨\n\n` +
        `⛔ Auto-trade has been <b>DISABLED</b>.\n` +
        `Positions closed: <b>${closed}/${results.length}</b>\n` +
        `Symbols: ${symbols || "none"}\n\n` +
        (failed.length ? `⚠️ Failed to close: ${failed.map((f) => `${f.symbol} (${f.error})`).join(", ")}\n\n` : "") +
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

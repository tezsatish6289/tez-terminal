import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { sendMessage, formatSignalMessage, type SignalEvent, type InlineKeyboardButton, getTimeframeName } from "@/lib/telegram";
import { AUTO_FILTER_THRESHOLD, isRegimeStale, type MarketRegimeData } from "@/lib/auto-filter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 1100;
const SITE_URL = "https://tezterminal.com";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Telegram notification cron.
 * 1) Top Pick signals → one consolidated "new signals available" message per cycle.
 * 2) TP/SL events → send to users who tapped "Track this trade".
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ success: false, error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  const db = getAdminFirestore();

  try {
    const usersSnap = await db.collection("users")
      .where("telegramEnabled", "==", true)
      .get();

    const allUsers: { uid: string; chatId: number; prefs: any }[] = [];
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      if (!userData.telegramChatId) continue;

      const prefsSnap = await db.collection("telegram_preferences").doc(userDoc.id).get();
      const prefs = prefsSnap.exists ? prefsSnap.data() : {
        enabled: true, timeframes: ["ALL"], sides: ["ALL"], symbols: [],
      };

      if (prefs!.enabled === false) continue;

      allUsers.push({
        uid: userDoc.id,
        chatId: userData.telegramChatId,
        prefs,
      });
    }

    let totalMessages = 0;

    // --- Load configurable base threshold ---
    let baseThreshold = AUTO_FILTER_THRESHOLD;
    try {
      const filterCfg = await db.collection("config").doc("auto_filter").get();
      if (filterCfg.exists) {
        const val = filterCfg.data()?.baseThreshold;
        if (typeof val === "number" && val > 0) baseThreshold = val;
      }
    } catch {}

    // --- Load dynamic thresholds ---
    const regimeSnap = await db.collection("config").doc("market_regime").get();
    const regimeData = regimeSnap.exists ? (regimeSnap.data() as MarketRegimeData) : null;

    function getThresholdForSignal(timeframe: string, side: string): number {
      if (!regimeData) return baseThreshold;
      const key = `${timeframe}_${side}`;
      const entry = regimeData[key];
      if (!entry || isRegimeStale(entry.lastUpdated, timeframe)) return baseThreshold;
      return entry.adjustedThreshold;
    }

    // --- Part 1: Send individual Top Pick details to matching users ---
    const topPickSnap = await db.collection("signals")
      .where("telegramNotified", "==", false)
      .get();

    const newTopPicks = topPickSnap.docs.filter((d) => {
      const s = d.data();
      const score = s.confidenceScore ?? 0;
      const threshold = getThresholdForSignal(String(s.timeframe || "15"), s.type);
      return score >= threshold;
    });

    let topPicksSent = 0;

    function matchesUserPrefs(signal: any, prefs: any): boolean {
      const tf = String(signal.timeframe || "15");
      const side = signal.type || "BUY";

      if (prefs.timeframes && !prefs.timeframes.includes("ALL") && !prefs.timeframes.includes(tf)) {
        return false;
      }
      if (prefs.sides && !prefs.sides.includes("ALL") && !prefs.sides.includes(side)) {
        return false;
      }
      if (prefs.symbols && prefs.symbols.length > 0) {
        const sym = (signal.symbol || "").replace(/\.P$/i, "").toUpperCase();
        if (!prefs.symbols.some((s: string) => sym.includes(s.toUpperCase()))) {
          return false;
        }
      }
      return true;
    }

    for (const signalDoc of newTopPicks) {
      const signal = signalDoc.data();
      const direction = signal.type === "BUY" ? "LONG" : "SHORT";
      const dirIcon = signal.type === "BUY" ? "🟢" : "🔴";
      const tfName = getTimeframeName(String(signal.timeframe || "15"));
      const tfLabel = signal.timeframe === "D" ? "Daily" : signal.timeframe + "m";
      const deepDiveUrl = `${SITE_URL}/chart/${signalDoc.id}`;

      const lines = [
        `${dirIcon} <b>TOP PICK: ${signal.symbol} — ${direction}</b>`,
        ``,
        `📊 ${tfName} (${tfLabel})`,
        `💰 Entry: <b>${signal.price}</b>`,
      ];
      if (signal.tp1 != null && signal.tp2 != null && signal.tp3 != null) {
        lines.push(`🎯 TP1: ${signal.tp1} | TP2: ${signal.tp2} | TP3: ${signal.tp3}`);
      }
      if (signal.stopLoss) {
        lines.push(`🛑 SL: ${signal.stopLoss}`);
      }
      if (signal.confidenceScore != null) {
        lines.push(`⚡ Confidence: <b>${signal.confidenceScore}</b>`);
      }
      lines.push(``);
      lines.push(`<i>Strategy: Book 50% at TP1, 25% at TP2, 25% at TP3</i>`);

      const message = lines.join("\n");
      const buttons: InlineKeyboardButton[][] = [
        [{ text: "📈 View Signal Details", url: deepDiveUrl }],
      ];

      const matchingUsers = allUsers.filter(u => matchesUserPrefs(signal, u.prefs));

      for (let i = 0; i < matchingUsers.length; i += BATCH_SIZE) {
        const batch = matchingUsers.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(sub =>
            sendMessage(sub.chatId, message, {
              replyMarkup: { inline_keyboard: buttons },
            }).catch(err => {
              console.error(`[Telegram Notify] Failed to send to ${sub.chatId}:`, err.message);
            })
          )
        );
        totalMessages += batch.length;

        if (i + BATCH_SIZE < matchingUsers.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      topPicksSent++;
    }

    // Mark all qualifying Top Picks as notified
    for (const doc of newTopPicks) {
      await doc.ref.update({
        telegramNotified: true,
        telegramNotifiedAt: new Date().toISOString(),
      });
    }

    // --- Part 2: TP/SL events → send to tracked users ---
    const eventsSnap = await db.collection("signal_events")
      .where("notified", "==", false)
      .get();

    let tpSlProcessed = 0;

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data() as SignalEvent & { createdAt: string };

      if (event.type === "NEW_SIGNAL") {
        await db.collection("signal_events").doc(eventDoc.id).update({
          notified: true,
          notifiedAt: new Date().toISOString(),
          notifiedCount: 0,
        });
        continue;
      }

      const trackedSnap = await db.collection("tracked_signals")
        .where("signalId", "==", event.signalId)
        .get();

      const message = formatSignalMessage(event);
      let recipients = 0;

      if (!trackedSnap.empty) {
        const trackers = trackedSnap.docs.map(d => ({ chatId: d.data().chatId }));

        for (let i = 0; i < trackers.length; i += BATCH_SIZE) {
          const batch = trackers.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(sub =>
              sendMessage(sub.chatId, message).catch(err => {
                console.error(`[Telegram Notify] Failed to send to ${sub.chatId}:`, err.message);
              })
            )
          );
          totalMessages += batch.length;
          recipients += batch.length;

          if (i + BATCH_SIZE < trackers.length) {
            await sleep(BATCH_DELAY_MS);
          }
        }
      }

      if (event.type === "TP3_HIT" || event.type === "SL_HIT") {
        const toDelete = await db.collection("tracked_signals")
          .where("signalId", "==", event.signalId)
          .get();
        for (const d of toDelete.docs) {
          await d.ref.delete();
        }
      }

      await db.collection("signal_events").doc(eventDoc.id).update({
        notified: true,
        notifiedAt: new Date().toISOString(),
        notifiedCount: recipients,
      });
      tpSlProcessed++;
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `TELEGRAM NOTIFY: topPicks=${topPicksSent} tpSlEvents=${tpSlProcessed} messages=${totalMessages} subscribers=${allUsers.length}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      topPicksSent,
      tpSlEvents: tpSlProcessed,
      messages: totalMessages,
      subscribers: allUsers.length,
    });
  } catch (error: any) {
    console.error("[Telegram Notify Cron]", error.message);
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Telegram Notify Failure",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

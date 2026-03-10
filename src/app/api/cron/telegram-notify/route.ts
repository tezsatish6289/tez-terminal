import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { sendMessage, formatSignalMessage, type SignalEvent, type InlineKeyboardButton, getTimeframeName } from "@/lib/telegram";
import { AUTO_FILTER_THRESHOLD, isRegimeStale, type MarketRegimeData } from "@/lib/auto-filter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 1100;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Telegram notification cron.
 * 1) Top Pick signals (score >= threshold) → fan out to all subscribers who haven't received it.
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
    let topPicksSent = 0;

    // --- Load dynamic thresholds ---
    const regimeSnap = await db.collection("config").doc("market_regime").get();
    const regimeData = regimeSnap.exists ? (regimeSnap.data() as MarketRegimeData) : null;

    function getThresholdForSignal(timeframe: string, side: string): number {
      if (!regimeData) return AUTO_FILTER_THRESHOLD;
      const key = `${timeframe}_${side}`;
      const entry = regimeData[key];
      if (!entry || isRegimeStale(entry.lastUpdated)) return AUTO_FILTER_THRESHOLD;
      return entry.adjustedThreshold;
    }

    // --- Part 1: Top Pick signals not yet sent to Telegram ---
    const topPickSnap = await db.collection("signals")
      .where("autoFilterPassed", "==", true)
      .where("telegramNotified", "==", false)
      .get();

    for (const signalDoc of topPickSnap.docs) {
      const signal = signalDoc.data();
      const score = signal.confidenceScore ?? 0;
      const threshold = getThresholdForSignal(String(signal.timeframe || "15"), signal.type);

      if (score < threshold) {
        continue;
      }

      if (allUsers.length === 0) {
        await signalDoc.ref.update({ telegramNotified: true, telegramNotifiedAt: new Date().toISOString() });
        continue;
      }

      const eventData: SignalEvent = {
        type: "NEW_SIGNAL",
        signalId: signalDoc.id,
        symbol: signal.symbol || "???",
        side: signal.type,
        timeframe: String(signal.timeframe || "15"),
        assetType: signal.assetType || "CRYPTO",
        entryPrice: signal.price,
        price: signal.price,
        stopLoss: signal.stopLoss,
        tp1: signal.tp1 ?? null,
        tp2: signal.tp2 ?? null,
        tp3: signal.tp3 ?? null,
        guidance: "",
      };

      const message = formatSignalMessage(eventData);
      const matched = allUsers.filter(sub => matchesPrefs(sub.prefs, eventData));

      const tradeUrl = `https://tezterminal.com/chart/${signalDoc.id}`;
      const buttons: InlineKeyboardButton[][] = [
        [
          { text: "📊 View Trade", url: tradeUrl },
          { text: "📌 Track", callback_data: `track:${signalDoc.id}` },
        ],
      ];

      for (let i = 0; i < matched.length; i += BATCH_SIZE) {
        const batch = matched.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(sub =>
              sendMessage(sub.chatId, message + "\n\nRecommended if you are trading this signal.", {
                replyMarkup: { inline_keyboard: buttons },
              }).catch(err => {
              console.error(`[Telegram Notify] Failed to send to ${sub.chatId}:`, err.message);
            })
          )
        );
        totalMessages += batch.length;

        if (i + BATCH_SIZE < matched.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      await signalDoc.ref.update({
        telegramNotified: true,
        telegramNotifiedAt: new Date().toISOString(),
      });
      topPicksSent++;
    }

    // --- Part 2: TP/SL events → send to tracked users ---
    const eventsSnap = await db.collection("signal_events")
      .where("notified", "==", false)
      .get();

    let tpSlProcessed = 0;

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data() as SignalEvent & { createdAt: string };

      if (event.type === "NEW_SIGNAL") {
        // NEW_SIGNAL is now handled by Part 1 above — just mark notified
        await db.collection("signal_events").doc(eventDoc.id).update({
          notified: true,
          notifiedAt: new Date().toISOString(),
          notifiedCount: 0,
        });
        continue;
      }

      // TP/SL events → send to users who tracked this signal
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

function matchesPrefs(prefs: any, event: SignalEvent): boolean {
  if (!matchesFilter(prefs.timeframes, event.timeframe)) return false;
  if (!matchesFilter(prefs.sides, event.side)) return false;

  const symbols: string[] = prefs.symbols || [];
  if (symbols.length > 0) {
    const eventSymbol = (event.symbol || "").toUpperCase();
    const match = symbols.some((s: string) => eventSymbol.includes(s.toUpperCase()));
    if (!match) return false;
  }

  return true;
}

function matchesFilter(filterValues: string[] | undefined, value: string): boolean {
  if (!filterValues || filterValues.length === 0 || filterValues.includes("ALL")) return true;
  return filterValues.includes(value);
}

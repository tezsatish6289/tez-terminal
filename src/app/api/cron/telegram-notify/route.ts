import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { sendMessage, formatSignalMessage, type SignalEvent, type InlineKeyboardButton } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 1100;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Telegram notification cron.
 * NEW_SIGNAL → fan out to all connected users (filtered by timeframe, side, symbols).
 * TP/SL events → send only to users who tapped "Track this trade" for that signal.
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
    const eventsSnap = await db.collection("signal_events")
      .where("notified", "==", false)
      .get();

    if (eventsSnap.empty) {
      return NextResponse.json({ success: true, events: 0, messages: 0 });
    }

    const usersSnap = await db.collection("users")
      .where("telegramEnabled", "==", true)
      .get();

    if (usersSnap.empty) {
      for (const eventDoc of eventsSnap.docs) {
        await db.collection("signal_events").doc(eventDoc.id).update({
          notified: true,
          notifiedAt: new Date().toISOString(),
          notifiedCount: 0,
        });
      }
      return NextResponse.json({ success: true, events: eventsSnap.size, messages: 0, reason: "no subscribers" });
    }

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

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data() as SignalEvent & { createdAt: string };
      const message = formatSignalMessage(event);

      let recipients: { chatId: number }[] = [];

      if (event.type === "NEW_SIGNAL") {
        const matched = allUsers.filter(sub => matchesNewSignalPrefs(sub.prefs, event));
        recipients = matched;

        const trackButton: InlineKeyboardButton[][] = [
          [{ text: "📌 Track this trade", callback_data: `track:${event.signalId}` }],
        ];

        for (let i = 0; i < matched.length; i += BATCH_SIZE) {
          const batch = matched.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(sub =>
              sendMessage(sub.chatId, message + "\n\nRecommended if you are trading this signal.", {
                replyMarkup: { inline_keyboard: trackButton },
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
      } else {
        const trackedSnap = await db.collection("tracked_signals")
          .where("signalId", "==", event.signalId)
          .get();

        if (!trackedSnap.empty) {
          recipients = trackedSnap.docs.map(d => ({ chatId: d.data().chatId }));

          for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const batch = recipients.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(sub =>
                sendMessage(sub.chatId, message).catch(err => {
                  console.error(`[Telegram Notify] Failed to send to ${sub.chatId}:`, err.message);
                })
              )
            );
            totalMessages += batch.length;

            if (i + BATCH_SIZE < recipients.length) {
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
      }

      await db.collection("signal_events").doc(eventDoc.id).update({
        notified: true,
        notifiedAt: new Date().toISOString(),
        notifiedCount: recipients.length,
      });
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `TELEGRAM NOTIFY: events=${eventsSnap.size} messages=${totalMessages} subscribers=${allUsers.length}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      events: eventsSnap.size,
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

function matchesNewSignalPrefs(prefs: any, event: SignalEvent): boolean {
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

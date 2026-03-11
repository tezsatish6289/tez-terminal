import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { sendMessage, type InlineKeyboardButton } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = "https://tezterminal.com";
const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 1100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * GET /api/cron/subscription-reminders?key=...
 * Sends Telegram reminders for subscriptions expiring in 3 days and 1 day.
 * Also sends expiration notices for subscriptions that just expired.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_BOT_TOKEN not configured" },
      { status: 500 }
    );
  }

  const db = getAdminFirestore();
  let totalMessages = 0;

  try {
    const now = new Date();
    const today = startOfDay(now);

    const threeDaysOut = addDays(today, 3);
    const threeDaysOutEnd = addDays(today, 4);
    const oneDayOut = addDays(today, 1);
    const oneDayOutEnd = addDays(today, 2);
    const yesterday = addDays(today, -1);

    const subscriptionsSnap = await db.collection("subscriptions").get();

    const reminders: { userId: string; type: "3day" | "1day" | "expired"; endDate: string }[] = [];

    for (const doc of subscriptionsSnap.docs) {
      const data = doc.data();
      const status = data.status;

      let endDateStr: string | null = null;
      if (status === "trial") {
        endDateStr = data.trialEndDate;
      } else if (status === "active") {
        endDateStr = data.subscriptionEndDate;
      } else if (status === "expired") {
        endDateStr = data.subscriptionEndDate || data.trialEndDate;
      }

      if (!endDateStr) continue;
      const endDate = new Date(endDateStr);

      if (endDate >= threeDaysOut && endDate < threeDaysOutEnd) {
        reminders.push({ userId: doc.id, type: "3day", endDate: endDateStr });
      } else if (endDate >= oneDayOut && endDate < oneDayOutEnd) {
        reminders.push({ userId: doc.id, type: "1day", endDate: endDateStr });
      } else if (endDate >= yesterday && endDate < today && status === "expired") {
        reminders.push({ userId: doc.id, type: "expired", endDate: endDateStr });
      }
    }

    const buttons: InlineKeyboardButton[][] = [
      [{ text: "🔄 Renew Now", url: `${SITE_URL}/subscribe` }],
    ];

    for (let i = 0; i < reminders.length; i += BATCH_SIZE) {
      const batch = reminders.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (reminder) => {
          try {
            const userSnap = await db.collection("users").doc(reminder.userId).get();
            const userData = userSnap.exists ? userSnap.data() : null;
            const chatId = userData?.telegramChatId;

            if (!chatId) return;

            let message = "";
            if (reminder.type === "3day") {
              message =
                "⏰ <b>Subscription reminder</b>\n\n" +
                "Your TezTerminal subscription expires in <b>3 days</b>. " +
                "Renew now to keep uninterrupted access to AI-powered trade signals.";
            } else if (reminder.type === "1day") {
              message =
                "🚨 <b>Last day!</b>\n\n" +
                "Your TezTerminal subscription expires <b>tomorrow</b>. " +
                "Renew now so you don't miss any signals.";
            } else {
              message =
                "📢 <b>Subscription expired</b>\n\n" +
                "Your TezTerminal subscription has expired. " +
                "Subscribe again to resume access to AI-powered trade signals, live updates, and alerts.";
            }

            await sendMessage(chatId, message, {
              replyMarkup: { inline_keyboard: buttons },
            });
            totalMessages++;
          } catch (err: any) {
            console.error(
              `[Sub Reminders] Failed for ${reminder.userId}:`,
              err.message
            );
          }
        })
      );

      if (i + BATCH_SIZE < reminders.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `SUBSCRIPTION REMINDERS: total=${reminders.length} messages=${totalMessages}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      reminders: reminders.length,
      messages: totalMessages,
    });
  } catch (error: any) {
    console.error("[Subscription Reminders]", error.message);
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: `Subscription Reminders Failure: ${error.message}`,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { setWebhook, deleteWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * One-time setup: registers the bot webhook URL with Telegram.
 * Call once after deployment: GET /api/telegram/setup-webhook?key=<CRON_SECRET>&action=set
 * To remove: GET /api/telegram/setup-webhook?key=<CRON_SECRET>&action=delete
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const action = searchParams.get("action") || "set";

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (action === "test") {
    const chatId = searchParams.get("chat");
    if (!chatId) {
      return NextResponse.json({ error: "Pass ?chat=YOUR_CHAT_ID to test" });
    }
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(chatId),
          text: "Test message from Tez Terminal!",
        }),
      });
      const data = await res.json();
      return NextResponse.json({ action: "test", tokenLength: (token || "").length, result: data });
    } catch (err: any) {
      return NextResponse.json({ action: "test", error: err.message });
    }
  }

  if (action === "delete") {
    const result = await deleteWebhook();
    return NextResponse.json({ action: "delete", result });
  }

  if (action === "info") {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const info = await res.json();
    return NextResponse.json({
      action: "info",
      tokenPresent: !!process.env.TELEGRAM_BOT_TOKEN,
      tokenLength: (process.env.TELEGRAM_BOT_TOKEN || "").length,
      info,
    });
  }

  const customUrl = searchParams.get("url");
  const webhookUrl = customUrl || "https://tezterminal.com/api/telegram/webhook";

  const result = await setWebhook(webhookUrl);
  return NextResponse.json({ action: "set", webhookUrl, result });
}

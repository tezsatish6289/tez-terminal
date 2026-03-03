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

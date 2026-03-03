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

  const host = request.headers.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  const result = await setWebhook(webhookUrl);
  return NextResponse.json({ action: "set", webhookUrl, result });
}

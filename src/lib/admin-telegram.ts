/**
 * Send Telegram messages to platform admins (ADMIN_EMAILS with linked Telegram).
 */
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { ADMIN_EMAILS } from "@/lib/admin-auth";
import { sendMessage } from "@/lib/telegram";

const chatIdCache: { ids: number[]; expiresAt: number } = { ids: [], expiresAt: 0 };

export async function getAdminTelegramChatIds(): Promise<number[]> {
  const now = Date.now();
  if (chatIdCache.expiresAt > now && chatIdCache.ids.length > 0) {
    return chatIdCache.ids;
  }

  const ids = new Set<number>();
  const envRaw = process.env.ADMIN_TELEGRAM_CHAT_ID?.trim();
  if (envRaw) {
    const n = Number(envRaw);
    if (Number.isFinite(n)) ids.add(n);
  }

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  for (const email of ADMIN_EMAILS) {
    try {
      const user = await auth.getUserByEmail(email);
      const doc = await db.collection("users").doc(user.uid).get();
      const chatId = doc.data()?.telegramChatId;
      if (typeof chatId === "number" && Number.isFinite(chatId)) {
        ids.add(chatId);
      }
    } catch {
      /* admin account may not exist in Auth */
    }
  }

  const list = [...ids];
  chatIdCache.ids = list;
  chatIdCache.expiresAt = now + 10 * 60 * 1000;
  return list;
}

/** Best-effort; never throws. */
export async function notifyAdminTelegram(text: string): Promise<void> {
  try {
    const chatIds = await getAdminTelegramChatIds();
    if (chatIds.length === 0) {
      console.warn("[AdminTelegram] No admin telegramChatId — set ADMIN_TELEGRAM_CHAT_ID or link Telegram in app");
      return;
    }
    await Promise.allSettled(
      chatIds.map((chatId) => sendMessage(chatId, text, { parseMode: "NONE" })),
    );
  } catch (e) {
    console.error("[AdminTelegram]", e instanceof Error ? e.message : e);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  sendMessage, answerCallbackQuery, editMessageText,
  getTimeframeName, type TelegramUpdate, type InlineKeyboardButton,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

const ALL_TIMEFRAMES = ["5", "15", "60", "240"];
const ALL_SIDES = ["BUY", "SELL"];

export async function POST(request: NextRequest) {
  const db = getAdminFirestore();

  try {
    const update: TelegramUpdate = await request.json();

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Telegram webhook received: ${update.message?.text || update.callback_query?.data || "unknown"}`,
      details: `chat_id=${update.message?.chat?.id || "?"} from=${update.message?.from?.username || "?"}`,
      webhookId: "TELEGRAM_BOT",
    });

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message?.text) {
      await handleMessage(update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[Telegram Webhook]", error.message);
    try {
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: `Telegram webhook error: ${error.message}`,
        details: error.stack || "",
        webhookId: "TELEGRAM_BOT",
      });
    } catch {}
    return NextResponse.json({ ok: true });
  }
}

// ─── Message Handlers ────────────────────────────────────────────

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();

  switch (command) {
    case "/start":
      await handleStart(chatId, parts[1], message.from);
      break;
    case "/stop":
      await handleStop(chatId);
      break;
    case "/resume":
      await handleResume(chatId);
      break;
    case "/settings":
      await handleSettings(chatId);
      break;
    case "/status":
      await handleStatus(chatId);
      break;
    case "/help":
      await handleHelp(chatId);
      break;
    default:
      await sendMessage(chatId, "I only respond to commands. Try /help to see what I can do.", { parseMode: "NONE" });
  }
}

async function handleStart(
  chatId: number,
  token: string | undefined,
  from: NonNullable<TelegramUpdate["message"]>["from"]
) {
  if (!token) {
    return sendMessage(chatId, [
      "Welcome to Tez Terminal!",
      "",
      "To connect your account, use the link from the Tez Terminal web app.",
      "Go to Settings > Telegram and click Connect Telegram.",
    ].join("\n"), { parseMode: "NONE" });
  }

  const db = getAdminFirestore();

  try {
    const tokenSnap = await db.collection("telegram_link_tokens").doc(token).get();

    if (!tokenSnap.exists) {
      return sendMessage(chatId, "This link has expired or is invalid. Please generate a new one from the Tez Terminal web app.", { parseMode: "NONE" });
    }

    const tokenData = tokenSnap.data()!;
    const expiry = new Date(tokenData.expiresAt).getTime();
    if (Date.now() > expiry) {
      await db.collection("telegram_link_tokens").doc(token).delete();
      return sendMessage(chatId, "This link has expired. Please generate a new one from Settings > Telegram.", { parseMode: "NONE" });
    }

    const firebaseUid = tokenData.firebaseUid;

    await db.collection("users").doc(firebaseUid).set({
      telegramChatId: chatId,
      telegramUsername: from.username || null,
      telegramFirstName: from.first_name || null,
      telegramConnectedAt: new Date().toISOString(),
      telegramEnabled: true,
    }, { merge: true });

    await db.collection("telegram_preferences").doc(firebaseUid).set({
      enabled: true,
      timeframes: ["ALL"],
      sides: ["ALL"],
      symbols: [],
    }, { merge: true });

    await db.collection("telegram_link_tokens").doc(token).delete();

    return sendMessage(chatId, [
      "Account connected!",
      "",
      "You are now linked to Tez Terminal.",
      "You will receive alerts for all signals by default.",
      "",
      "Use /settings to customize your alerts.",
      "Use /help to see all commands.",
    ].join("\n"), { parseMode: "NONE" });
  } catch (err: any) {
    try {
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: `handleStart token error: ${err.message}`,
        details: `token=${token?.slice(0, 10)}... chat=${chatId} stack=${(err.stack || "").slice(0, 200)}`,
        webhookId: "TELEGRAM_BOT",
      });
    } catch {}
    return sendMessage(chatId, `Debug: ${err.message}`, { parseMode: "NONE" });
  }
}

async function handleStop(chatId: number) {
  const db = getAdminFirestore();
  const uid = await findUidByChatId(chatId);
  if (!uid) {
    return sendMessage(chatId, "You don't have a connected account. Use the link from Tez Terminal web app to connect.", { parseMode: "NONE" });
  }

  await db.collection("users").doc(uid).update({ telegramEnabled: false });
  return sendMessage(chatId, "Alerts paused. Use /resume to start receiving alerts again.", { parseMode: "NONE" });
}

async function handleResume(chatId: number) {
  const db = getAdminFirestore();
  const uid = await findUidByChatId(chatId);
  if (!uid) {
    return sendMessage(chatId, "You don't have a connected account. Use the link from Tez Terminal web app to connect.", { parseMode: "NONE" });
  }

  await db.collection("users").doc(uid).update({ telegramEnabled: true });
  return sendMessage(chatId, "Alerts resumed. You will receive signals again.", { parseMode: "NONE" });
}

async function handleStatus(chatId: number) {
  const db = getAdminFirestore();
  const uid = await findUidByChatId(chatId);
  if (!uid) {
    return sendMessage(chatId, "No connected account found.", { parseMode: "NONE" });
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const prefsSnap = await db.collection("telegram_preferences").doc(uid).get();
  const userData = userSnap.data();
  const prefs = prefsSnap.data();

  const enabled = userData?.telegramEnabled !== false;
  const timeframes = prefs?.timeframes || ["ALL"];
  const sides = prefs?.sides || ["ALL"];
  const symbols = prefs?.symbols || [];

  const tfDisplay = timeframes.includes("ALL")
    ? "All timeframes"
    : timeframes.map((tf: string) => getTimeframeName(tf)).join(", ");
  const sideDisplay = sides.includes("ALL") ? "Both sides" : sides.join(", ");
  const symbolDisplay = symbols.length === 0 ? "All symbols" : symbols.join(", ");

  const trackedSnap = await db.collection("tracked_signals")
    .where("userId", "==", uid)
    .get();
  const trackedCount = trackedSnap.size;

  return sendMessage(chatId, [
    "Your Alert Status",
    "",
    `Status: ${enabled ? "Active" : "Paused"}`,
    `Timeframes: ${tfDisplay}`,
    `Sides: ${sideDisplay}`,
    `Symbols: ${symbolDisplay}`,
    `Tracking: ${trackedCount} active trade${trackedCount !== 1 ? "s" : ""}`,
    "",
    "Use /settings to change these.",
  ].join("\n"), { parseMode: "NONE" });
}

async function handleHelp(chatId: number) {
  return sendMessage(chatId, [
    "Tez Terminal Bot Commands",
    "",
    "/status - View your connection and alert settings",
    "/settings - Customize which alerts you receive",
    "/stop - Pause all alerts",
    "/resume - Resume alerts",
    "/help - Show this message",
  ].join("\n"), { parseMode: "NONE" });
}

// ─── Settings with Inline Keyboard ──────────────────────────────

async function handleSettings(chatId: number) {
  const uid = await findUidByChatId(chatId);
  if (!uid) {
    return sendMessage(chatId, "You don't have a connected account. Use the link from Tez Terminal web app to connect.", { parseMode: "NONE" });
  }

  return sendSettingsMenu(chatId, uid);
}

async function sendSettingsMenu(chatId: number, uid: string) {
  const keyboard: InlineKeyboardButton[][] = [
    [{ text: "📊 Timeframes", callback_data: "settings:timeframes" }],
    [{ text: "📈 Side (Buy/Sell)", callback_data: "settings:sides" }],
    [{ text: "🔤 Watch Symbols", callback_data: "settings:symbols" }],
  ];

  return sendMessage(chatId, "Alert Settings\n\nChoose what to configure:", {
    parseMode: "NONE",
    replyMarkup: { inline_keyboard: keyboard },
  });
}

// ─── Callback Query Handler ─────────────────────────────────────

async function handleCallbackQuery(cq: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";

  if (!chatId || !messageId) {
    await answerCallbackQuery(cq.id);
    return;
  }

  const db = getAdminFirestore();
  const uid = await findUidByChatId(chatId);
  if (!uid) {
    await answerCallbackQuery(cq.id, "No connected account found.");
    return;
  }

  const prefsRef = db.collection("telegram_preferences").doc(uid);
  const prefsSnap = await prefsRef.get();
  const prefs = prefsSnap.data() || {
    timeframes: ["ALL"],
    sides: ["ALL"],
    symbols: [],
  };

  if (data === "settings:timeframes") {
    await showToggleMenu(chatId, messageId, "Timeframes", prefs.timeframes, ALL_TIMEFRAMES, "tf", getTimeframeName);
  } else if (data === "settings:sides") {
    await showToggleMenu(chatId, messageId, "Sides", prefs.sides, ALL_SIDES, "side", (v: string) => v);
  } else if (data.startsWith("track:")) {
    await handleTrackSignal(chatId, uid, data.slice(6), cq.id);
    return;
  } else if (data === "settings:symbols") {
    const symbolList = (prefs.symbols || []).length > 0
      ? prefs.symbols.join(", ")
      : "None (receiving all symbols)";
    await editMessageText(chatId, messageId, [
      "Symbol Watchlist",
      "",
      `Current: ${symbolList}`,
      "",
      "To set specific symbols, use the Tez Terminal web app > Settings > Telegram > Symbol Filter.",
      "",
      "Send an empty list to receive all symbols.",
    ].join("\n"), {
      parseMode: "NONE",
      replyMarkup: { inline_keyboard: [[{ text: "Back", callback_data: "settings:back" }]] },
    });
  } else if (data === "settings:back") {
    await refreshSettingsInPlace(chatId, messageId, uid);
  } else if (data.startsWith("toggle:")) {
    await handleToggle(chatId, messageId, data, uid, prefs, prefsRef);
  }

  await answerCallbackQuery(cq.id);
}

async function showToggleMenu(
  chatId: number,
  messageId: number,
  title: string,
  current: string[],
  allOptions: string[],
  prefix: string,
  labelFn: (v: string) => string,
) {
  const isAll = current.includes("ALL");
  const keyboard: InlineKeyboardButton[][] = [];

  const allCheck = isAll ? "✅" : "⬜";
  keyboard.push([{ text: `${allCheck} All`, callback_data: `toggle:${prefix}:ALL` }]);

  for (const opt of allOptions) {
    const active = isAll || current.includes(opt);
    const check = active ? "✅" : "⬜";
    keyboard.push([{ text: `${check} ${labelFn(opt)}`, callback_data: `toggle:${prefix}:${opt}` }]);
  }

  keyboard.push([{ text: "← Back", callback_data: "settings:back" }]);

  await editMessageText(chatId, messageId, `${title}\n\nTap to toggle:`, {
    parseMode: "NONE",
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleToggle(
  chatId: number,
  messageId: number,
  data: string,
  uid: string,
  prefs: any,
  prefsRef: FirebaseFirestore.DocumentReference,
) {
  const [, prefix, value] = data.split(":");

  const fieldMap: Record<string, { field: string; allOptions: string[]; labelFn: (v: string) => string; title: string }> = {
    tf: { field: "timeframes", allOptions: ALL_TIMEFRAMES, labelFn: getTimeframeName, title: "Timeframes" },
    side: { field: "sides", allOptions: ALL_SIDES, labelFn: (v: string) => v, title: "Sides" },
  };

  const config = fieldMap[prefix];
  if (!config) return;

  let current: string[] = prefs[config.field] || ["ALL"];

  if (value === "ALL") {
    current = current.includes("ALL") ? [] : ["ALL"];
  } else {
    if (current.includes("ALL")) {
      current = config.allOptions.filter(o => o !== value);
    } else if (current.includes(value)) {
      current = current.filter((v: string) => v !== value);
    } else {
      current = [...current, value];
    }
    if (current.length === config.allOptions.length) {
      current = ["ALL"];
    }
  }

  if (current.length === 0) {
    current = ["ALL"];
  }

  await prefsRef.update({ [config.field]: current });

  prefs[config.field] = current;
  await showToggleMenu(chatId, messageId, config.title, current, config.allOptions, prefix, config.labelFn);
}

async function refreshSettingsInPlace(chatId: number, messageId: number, uid: string) {
  const keyboard: InlineKeyboardButton[][] = [
    [{ text: "📊 Timeframes", callback_data: "settings:timeframes" }],
    [{ text: "📈 Side (Buy/Sell)", callback_data: "settings:sides" }],
    [{ text: "🔤 Watch Symbols", callback_data: "settings:symbols" }],
  ];

  await editMessageText(chatId, messageId, "Alert Settings\n\nChoose what to configure:", {
    parseMode: "NONE",
    replyMarkup: { inline_keyboard: keyboard },
  });
}

// ─── Track Signal Handler ────────────────────────────────────────

async function handleTrackSignal(chatId: number, uid: string, signalId: string, callbackId: string) {
  const db = getAdminFirestore();

  const existing = await db.collection("tracked_signals")
    .where("userId", "==", uid)
    .where("signalId", "==", signalId)
    .limit(1)
    .get();

  if (!existing.empty) {
    await answerCallbackQuery(callbackId, "You're already tracking this trade.");
    return;
  }

  await db.collection("tracked_signals").add({
    userId: uid,
    signalId,
    chatId,
    trackedAt: new Date().toISOString(),
  });

  await answerCallbackQuery(callbackId, "Tracking! You'll get TP/SL updates for this trade.");
}

// ─── Helpers ────────────────────────────────────────────────────

async function findUidByChatId(chatId: number): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db.collection("users")
    .where("telegramChatId", "==", chatId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

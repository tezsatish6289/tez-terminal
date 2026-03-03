import { NextRequest, NextResponse } from "next/server";
import { initializeFirebase } from "@/firebase";
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, getDocs,
} from "firebase/firestore";
import {
  sendMessage, answerCallbackQuery, editMessageText,
  getTimeframeName, type TelegramUpdate, type InlineKeyboardButton,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

const ALL_TIMEFRAMES = ["5", "15", "60", "240", "D"];
const ALL_ASSET_TYPES = ["CRYPTO", "INDIAN STOCKS", "US STOCKS"];
const ALL_SIDES = ["BUY", "SELL"];
const ALL_EVENT_TYPES = ["NEW_SIGNAL", "TP1_HIT", "TP2_HIT", "TP3_HIT", "SL_HIT"];

/**
 * Telegram Bot webhook — receives all messages and callback queries.
 * Registered with Telegram via setWebhook().
 */
export async function POST(request: NextRequest) {
  let firestore: any;

  try {
    const fb = initializeFirebase();
    firestore = fb.firestore;
  } catch (e: any) {
    console.error("[Telegram Webhook] Firebase init failed:", e.message);
    return NextResponse.json({ ok: true });
  }

  try {
    const update: TelegramUpdate = await request.json();

    await addDoc(collection(firestore, "logs"), {
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
      await addDoc(collection(firestore, "logs"), {
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
      await sendMessage(chatId, [
        "I only respond to commands. Try /help to see what I can do.",
      ].join("\n"));
  }
}

async function handleStart(
  chatId: number,
  token: string | undefined,
  from: NonNullable<TelegramUpdate["message"]>["from"]
) {
  if (!token) {
    await sendMessage(chatId, [
      "👋 Welcome to <b>Tez Terminal</b>!",
      "",
      "To connect your account, use the link from the Tez Terminal web app.",
      "Go to <b>Settings → Telegram</b> and click <b>Connect Telegram</b>.",
    ].join("\n"));
    return;
  }

  const { firestore } = initializeFirebase();
  const tokenDoc = await getDoc(doc(firestore, "telegram_link_tokens", token));

  if (!tokenDoc.exists()) {
    await sendMessage(chatId, "❌ This link has expired or is invalid. Please generate a new one from the Tez Terminal web app.");
    return;
  }

  const tokenData = tokenDoc.data();
  const expiry = new Date(tokenData.expiresAt).getTime();
  if (Date.now() > expiry) {
    await deleteDoc(doc(firestore, "telegram_link_tokens", token));
    await sendMessage(chatId, "❌ This link has expired. Please generate a new one from Settings → Telegram.");
    return;
  }

  const firebaseUid = tokenData.firebaseUid;

  await setDoc(doc(firestore, "users", firebaseUid), {
    telegramChatId: chatId,
    telegramUsername: from.username || null,
    telegramFirstName: from.first_name || null,
    telegramConnectedAt: new Date().toISOString(),
    telegramEnabled: true,
  }, { merge: true });

  const prefsRef = doc(firestore, "telegram_preferences", firebaseUid);
  const prefsSnap = await getDoc(prefsRef);
  if (!prefsSnap.exists()) {
    await setDoc(prefsRef, {
      enabled: true,
      alertTypes: ALL_EVENT_TYPES,
      timeframes: ["ALL"],
      assetTypes: ["ALL"],
      sides: ["ALL"],
      symbols: [],
    });
  }

  await deleteDoc(doc(firestore, "telegram_link_tokens", token));

  await sendMessage(chatId, [
    "✅ <b>Account connected!</b>",
    "",
    `You're now linked to Tez Terminal.`,
    "You'll receive alerts for all signals by default.",
    "",
    "Use /settings to customize your alerts.",
    "Use /help to see all commands.",
  ].join("\n"));
}

async function handleStop(chatId: number) {
  const { firestore } = initializeFirebase();
  const uid = await findUidByChatId(firestore, chatId);
  if (!uid) {
    await sendMessage(chatId, "You don't have a connected account. Use the link from Tez Terminal web app to connect.");
    return;
  }

  await updateDoc(doc(firestore, "users", uid), { telegramEnabled: false });
  await sendMessage(chatId, [
    "⏸ Alerts <b>paused</b>.",
    "",
    "Use /resume to start receiving alerts again.",
  ].join("\n"));
}

async function handleResume(chatId: number) {
  const { firestore } = initializeFirebase();
  const uid = await findUidByChatId(firestore, chatId);
  if (!uid) {
    await sendMessage(chatId, "You don't have a connected account. Use the link from Tez Terminal web app to connect.");
    return;
  }

  await updateDoc(doc(firestore, "users", uid), { telegramEnabled: true });
  await sendMessage(chatId, "▶️ Alerts <b>resumed</b>. You'll receive signals again.");
}

async function handleStatus(chatId: number) {
  const { firestore } = initializeFirebase();
  const uid = await findUidByChatId(firestore, chatId);
  if (!uid) {
    await sendMessage(chatId, "❌ No connected account found.");
    return;
  }

  const userDoc = await getDoc(doc(firestore, "users", uid));
  const prefsDoc = await getDoc(doc(firestore, "telegram_preferences", uid));
  const userData = userDoc.data();
  const prefs = prefsDoc.data();

  const enabled = userData?.telegramEnabled !== false;
  const timeframes = prefs?.timeframes || ["ALL"];
  const assetTypes = prefs?.assetTypes || ["ALL"];
  const sides = prefs?.sides || ["ALL"];
  const symbols = prefs?.symbols || [];

  const tfDisplay = timeframes.includes("ALL")
    ? "All timeframes"
    : timeframes.map((tf: string) => getTimeframeName(tf)).join(", ");
  const assetDisplay = assetTypes.includes("ALL") ? "All asset types" : assetTypes.join(", ");
  const sideDisplay = sides.includes("ALL") ? "Both sides" : sides.join(", ");
  const symbolDisplay = symbols.length === 0 ? "All symbols" : symbols.join(", ");

  await sendMessage(chatId, [
    `📊 <b>Your Alert Status</b>`,
    ``,
    `Status: ${enabled ? "▶️ Active" : "⏸ Paused"}`,
    `Timeframes: ${tfDisplay}`,
    `Asset types: ${assetDisplay}`,
    `Sides: ${sideDisplay}`,
    `Symbols: ${symbolDisplay}`,
    ``,
    `Use /settings to change these.`,
  ].join("\n"));
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, [
    "📖 <b>Tez Terminal Bot Commands</b>",
    "",
    "/status — View your connection & alert settings",
    "/settings — Customize which alerts you receive",
    "/stop — Pause all alerts",
    "/resume — Resume alerts",
    "/help — Show this message",
  ].join("\n"));
}

// ─── Settings with Inline Keyboard ──────────────────────────────

async function handleSettings(chatId: number) {
  const { firestore } = initializeFirebase();
  const uid = await findUidByChatId(firestore, chatId);
  if (!uid) {
    await sendMessage(chatId, "You don't have a connected account. Use the link from Tez Terminal web app to connect.");
    return;
  }

  await sendSettingsMenu(chatId, uid);
}

async function sendSettingsMenu(chatId: number, uid: string) {
  const { firestore } = initializeFirebase();
  const prefsDoc = await getDoc(doc(firestore, "telegram_preferences", uid));
  const prefs = prefsDoc.data() || {
    timeframes: ["ALL"],
    assetTypes: ["ALL"],
    sides: ["ALL"],
    alertTypes: ALL_EVENT_TYPES,
  };

  const keyboard: InlineKeyboardButton[][] = [
    [{ text: "📊 Timeframes", callback_data: "settings:timeframes" }],
    [{ text: "💹 Asset Types", callback_data: "settings:assets" }],
    [{ text: "📈 Side (Buy/Sell)", callback_data: "settings:sides" }],
    [{ text: "🔔 Alert Types", callback_data: "settings:alerts" }],
    [{ text: "🔤 Watch Symbols", callback_data: "settings:symbols" }],
  ];

  await sendMessage(chatId, "<b>⚙️ Alert Settings</b>\n\nChoose what to configure:", {
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

  const { firestore } = initializeFirebase();
  const uid = await findUidByChatId(firestore, chatId);
  if (!uid) {
    await answerCallbackQuery(cq.id, "No connected account found.");
    return;
  }

  const prefsRef = doc(firestore, "telegram_preferences", uid);
  const prefsSnap = await getDoc(prefsRef);
  const prefs = prefsSnap.data() || {
    timeframes: ["ALL"],
    assetTypes: ["ALL"],
    sides: ["ALL"],
    alertTypes: ALL_EVENT_TYPES,
    symbols: [],
  };

  if (data === "settings:timeframes") {
    await showToggleMenu(chatId, messageId, "Timeframes", prefs.timeframes, ALL_TIMEFRAMES, "tf", getTimeframeName);
  } else if (data === "settings:assets") {
    await showToggleMenu(chatId, messageId, "Asset Types", prefs.assetTypes, ALL_ASSET_TYPES, "asset", (v: string) => v);
  } else if (data === "settings:sides") {
    await showToggleMenu(chatId, messageId, "Sides", prefs.sides, ALL_SIDES, "side", (v: string) => v);
  } else if (data === "settings:alerts") {
    const labelMap: Record<string, string> = {
      NEW_SIGNAL: "New Signal",
      TP1_HIT: "TP1 Hit",
      TP2_HIT: "TP2 Hit",
      TP3_HIT: "TP3 Hit",
      SL_HIT: "SL Hit",
    };
    await showToggleMenu(chatId, messageId, "Alert Types", prefs.alertTypes, ALL_EVENT_TYPES, "evt", (v: string) => labelMap[v] || v);
  } else if (data === "settings:symbols") {
    const symbolList = (prefs.symbols || []).length > 0
      ? prefs.symbols.join(", ")
      : "None (receiving all symbols)";
    await editMessageText(chatId, messageId, [
      "<b>🔤 Symbol Watchlist</b>",
      "",
      `Current: ${symbolList}`,
      "",
      "To set specific symbols, use the Tez Terminal web app → Settings → Telegram → Symbol Filter.",
      "",
      "Send an empty list to receive all symbols.",
    ].join("\n"), {
      replyMarkup: { inline_keyboard: [[{ text: "← Back", callback_data: "settings:back" }]] },
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

  await editMessageText(chatId, messageId, `<b>⚙️ ${title}</b>\n\nTap to toggle:`, {
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleToggle(
  chatId: number,
  messageId: number,
  data: string,
  uid: string,
  prefs: any,
  prefsRef: any,
) {
  const [, prefix, value] = data.split(":");

  const fieldMap: Record<string, { field: string; allOptions: string[]; labelFn: (v: string) => string; title: string }> = {
    tf: { field: "timeframes", allOptions: ALL_TIMEFRAMES, labelFn: getTimeframeName, title: "Timeframes" },
    asset: { field: "assetTypes", allOptions: ALL_ASSET_TYPES, labelFn: (v: string) => v, title: "Asset Types" },
    side: { field: "sides", allOptions: ALL_SIDES, labelFn: (v: string) => v, title: "Sides" },
    evt: {
      field: "alertTypes", allOptions: ALL_EVENT_TYPES, title: "Alert Types",
      labelFn: (v: string) => ({ NEW_SIGNAL: "New Signal", TP1_HIT: "TP1 Hit", TP2_HIT: "TP2 Hit", TP3_HIT: "TP3 Hit", SL_HIT: "SL Hit" }[v] || v),
    },
  };

  const config = fieldMap[prefix];
  if (!config) return;

  const { firestore } = initializeFirebase();
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

  await updateDoc(prefsRef, { [config.field]: current });

  prefs[config.field] = current;
  await showToggleMenu(chatId, messageId, config.title, current, config.allOptions, prefix, config.labelFn);
}

async function refreshSettingsInPlace(chatId: number, messageId: number, uid: string) {
  const { firestore } = initializeFirebase();
  const prefsDoc = await getDoc(doc(firestore, "telegram_preferences", uid));
  const prefs = prefsDoc.data() || {};

  const keyboard: InlineKeyboardButton[][] = [
    [{ text: "📊 Timeframes", callback_data: "settings:timeframes" }],
    [{ text: "💹 Asset Types", callback_data: "settings:assets" }],
    [{ text: "📈 Side (Buy/Sell)", callback_data: "settings:sides" }],
    [{ text: "🔔 Alert Types", callback_data: "settings:alerts" }],
    [{ text: "🔤 Watch Symbols", callback_data: "settings:symbols" }],
  ];

  await editMessageText(chatId, messageId, "<b>⚙️ Alert Settings</b>\n\nChoose what to configure:", {
    replyMarkup: { inline_keyboard: keyboard },
  });
}

// ─── Helpers ────────────────────────────────────────────────────

async function findUidByChatId(firestore: any, chatId: number): Promise<string | null> {
  const usersRef = collection(firestore, "users");
  const q = query(usersRef, where("telegramChatId", "==", chatId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}
